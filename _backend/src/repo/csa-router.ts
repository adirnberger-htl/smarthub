import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Connection {
  departure_stop: string;
  arrival_stop: string;
  departure_time: number;
  arrival_time: number;
  trip_id: string;
}

export interface StopData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  idx: number;
}

export interface TripData {
  id: string;
  route_short_name: string;
  route_long_name: string;
  route_type: number;
  serviceIdx: number;
}

export interface ServiceData {
  id: string;
  daysMask: number; // bit 0 = Sun, bit 1 = Mon, ..., bit 6 = Sat
  startDate: number; // YYYYMMDD as int
  endDate: number;   // YYYYMMDD as int
  addedDates: Set<number>;
  removedDates: Set<number>;
}

export interface IndexedFootpath {
  toIdx: number;
  walkTime: number;
}

interface CacheMetadata {
  version: number;
  sourceMtimeMs: number;
  stops: Array<{ id: string; name: string; lat: number; lon: number }>;
  trips: Array<{ id: string; s: string; l: string; t: number; svc: number }>;
  services: Array<{ id: string; mask: number; start: number; end: number; add: number[]; rem: number[] }>;
  footpaths: Array<Array<[number, number]>>;
  numConnections: number;
}

const CACHE_VERSION = 2;

export class CSARouter {
  private stopList: StopData[] = [];
  private stopIdToIdx = new Map<string, number>();
  private tripList: TripData[] = [];
  private tripIdToIdx = new Map<string, number>();
  private serviceList: ServiceData[] = [];
  private serviceIdToIdx = new Map<string, number>();
  private footpathsByStopIdx: IndexedFootpath[][] = [];

  // Compact TypedArray columns for forward connections (sorted ascending by departure_time)
  private numConnections = 0;
  private fwdDepStop = new Int32Array(0);
  private fwdArrStop = new Int32Array(0);
  private fwdDepTime = new Int32Array(0);
  private fwdArrTime = new Int32Array(0);
  private fwdTripIdx = new Int32Array(0);

  // Compact TypedArray columns for reverse connections (sorted descending by arrival_time)
  private bwdDepStop = new Int32Array(0);
  private bwdArrStop = new Int32Array(0);
  private bwdDepTime = new Int32Array(0);
  private bwdArrTime = new Int32Array(0);
  private bwdTripIdx = new Int32Array(0);

  // Active service cache by YYYYMMDD integer
  private activeServiceCache = new Map<number, Uint8Array>();

  public ready = false;

  public timeToSeconds(timeStr: string): number {
    if (!timeStr) return -1;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return -1;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const s = parts.length >= 3 ? Number(parts[2]) : 0;
    if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return -1;
    return h * 3600 + m * 60 + s;
  }

  public secondsToTime(seconds: number): string {
    const wrapped = ((seconds % 86400) + 86400) % 86400;
    const h = Math.floor(wrapped / 3600);
    const m = Math.floor((wrapped % 3600) / 60);
    const s = wrapped % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  private resolveDataDir(): string | null {
    const candidates = [
      process.env.GTFS_DATA_DIR,
      '/data',
      path.resolve(__dirname, '../../../data'),
      path.resolve(process.cwd(), '../data'),
      path.resolve(process.cwd(), 'data')
    ].filter(Boolean) as string[];

    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        const hasLinz = fs.existsSync(path.join(dir, 'LINZ_AG_GTFS_2026')) || fs.existsSync(path.join(dir, 'LINZ_AG_GTFS_2026.zip'));
        const hasOoevv = fs.existsSync(path.join(dir, 'OOEVV_GTFS_2026')) || fs.existsSync(path.join(dir, 'OOEVV_GTFS_2026.zip'));
        if (hasLinz || hasOoevv) {
          return dir;
        }
      }
    }
    return null;
  }

  private ensureDatasetExtracted(dataDir: string, folderName: string): string | null {
    const targetDir = path.join(dataDir, folderName);
    const stopsFile = path.join(targetDir, 'stops.txt');
    if (fs.existsSync(stopsFile)) {
      return targetDir;
    }
    const zipFile = path.join(dataDir, `${folderName}.zip`);
    if (fs.existsSync(zipFile)) {
      try {
        console.log(`[CSA] Extracting ${zipFile} to ${targetDir}...`);
        fs.mkdirSync(targetDir, { recursive: true });
        execFileSync('unzip', ['-o', '-q', zipFile, '-d', targetDir]);
        if (fs.existsSync(stopsFile)) {
          return targetDir;
        }
      } catch (e: any) {
        console.warn(`[CSA] Failed to extract ${zipFile}: ${e.message}`);
      }
    }
    return null;
  }

  private getDatasetsLatestMtime(dirs: string[]): number {
    let maxMtime = 0;
    const files = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'];
    for (const d of dirs) {
      for (const f of files) {
        const p = path.join(d, f);
        if (fs.existsSync(p)) {
          const stat = fs.statSync(p);
          if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
        }
      }
    }
    return Math.floor(maxMtime);
  }

  private tryLoadFromDiskCache(dataDir: string, expectedMtime: number): boolean {
    const metaPath = path.join(dataDir, 'csa-graph-cache.meta.json');
    const binPath = path.join(dataDir, 'csa-graph-cache.bin');
    if (!fs.existsSync(metaPath) || !fs.existsSync(binPath)) return false;

    try {
      console.time('[CSA] Load from disk cache');
      const metaRaw = fs.readFileSync(metaPath, 'utf8');
      const meta = JSON.parse(metaRaw) as CacheMetadata;
      if (meta.version !== CACHE_VERSION || meta.sourceMtimeMs !== expectedMtime) {
        console.timeEnd('[CSA] Load from disk cache');
        return false;
      }

      const n = meta.numConnections;
      const expectedBytes = n * 10 * 4;
      const buf = fs.readFileSync(binPath);
      if (buf.byteLength !== expectedBytes) {
        console.timeEnd('[CSA] Load from disk cache');
        return false;
      }

      this.stopList = [];
      this.stopIdToIdx.clear();
      for (let i = 0; i < meta.stops.length; i++) {
        const s = meta.stops[i];
        this.stopList.push({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, idx: i });
        this.stopIdToIdx.set(s.id, i);
      }

      this.serviceList = [];
      this.serviceIdToIdx.clear();
      for (let i = 0; i < meta.services.length; i++) {
        const sv = meta.services[i];
        this.serviceList.push({
          id: sv.id,
          daysMask: sv.mask,
          startDate: sv.start,
          endDate: sv.end,
          addedDates: new Set(sv.add),
          removedDates: new Set(sv.rem)
        });
        this.serviceIdToIdx.set(sv.id, i);
      }

      this.tripList = [];
      this.tripIdToIdx.clear();
      for (let i = 0; i < meta.trips.length; i++) {
        const t = meta.trips[i];
        this.tripList.push({
          id: t.id,
          route_short_name: t.s,
          route_long_name: t.l,
          route_type: t.t,
          serviceIdx: t.svc
        });
        this.tripIdToIdx.set(t.id, i);
      }

      this.footpathsByStopIdx = meta.footpaths.map(list =>
        list.map(([toIdx, walkTime]) => ({ toIdx, walkTime }))
      );

      this.numConnections = n;
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const i32 = new Int32Array(ab);
      this.fwdDepStop = i32.subarray(0, n);
      this.fwdArrStop = i32.subarray(n, 2 * n);
      this.fwdDepTime = i32.subarray(2 * n, 3 * n);
      this.fwdArrTime = i32.subarray(3 * n, 4 * n);
      this.fwdTripIdx = i32.subarray(4 * n, 5 * n);
      this.bwdDepStop = i32.subarray(5 * n, 6 * n);
      this.bwdArrStop = i32.subarray(6 * n, 7 * n);
      this.bwdDepTime = i32.subarray(7 * n, 8 * n);
      this.bwdArrTime = i32.subarray(8 * n, 9 * n);
      this.bwdTripIdx = i32.subarray(9 * n, 10 * n);

      this.activeServiceCache.clear();
      this.ready = true;
      console.timeEnd('[CSA] Load from disk cache');
      console.log(`[CSA] Loaded cached graph. Stops: ${this.stopList.length}, Trips: ${this.tripList.length}, Services: ${this.serviceList.length}, Connections: ${this.numConnections}`);
      return true;
    } catch (e: any) {
      console.warn(`[CSA] Disk cache read failed, rebuilding: ${e.message}`);
      return false;
    }
  }

  private saveToDiskCache(dataDir: string, sourceMtimeMs: number): void {
    try {
      const metaPath = path.join(dataDir, 'csa-graph-cache.meta.json');
      const binPath = path.join(dataDir, 'csa-graph-cache.bin');
      const meta: CacheMetadata = {
        version: CACHE_VERSION,
        sourceMtimeMs,
        stops: this.stopList.map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon })),
        trips: this.tripList.map(t => ({ id: t.id, s: t.route_short_name, l: t.route_long_name, t: t.route_type, svc: t.serviceIdx })),
        services: this.serviceList.map(sv => ({
          id: sv.id,
          mask: sv.daysMask,
          start: sv.startDate,
          end: sv.endDate,
          add: Array.from(sv.addedDates),
          rem: Array.from(sv.removedDates)
        })),
        footpaths: this.footpathsByStopIdx.map(list => list.map(fp => [fp.toIdx, fp.walkTime])),
        numConnections: this.numConnections
      };

      const n = this.numConnections;
      const combined = new Int32Array(n * 10);
      combined.set(this.fwdDepStop, 0);
      combined.set(this.fwdArrStop, n);
      combined.set(this.fwdDepTime, 2 * n);
      combined.set(this.fwdArrTime, 3 * n);
      combined.set(this.fwdTripIdx, 4 * n);
      combined.set(this.bwdDepStop, 5 * n);
      combined.set(this.bwdArrStop, 6 * n);
      combined.set(this.bwdDepTime, 7 * n);
      combined.set(this.bwdArrTime, 8 * n);
      combined.set(this.bwdTripIdx, 9 * n);

      fs.writeFileSync(binPath, Buffer.from(combined.buffer, combined.byteOffset, combined.byteLength));
      fs.writeFileSync(metaPath, JSON.stringify(meta));
      console.log(`[CSA] Saved compiled graph cache to ${dataDir}`);
    } catch (e: any) {
      console.warn(`[CSA] Could not write disk cache: ${e.message}`);
    }
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  private async streamCSV(filePath: string, onRow: (row: Record<string, string>) => void): Promise<void> {
    if (!fs.existsSync(filePath)) return;
    const fileStream = createReadStream(filePath);
    const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
    let headers: string[] = [];
    let isFirst = true;

    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      if (isFirst) {
        headers = this.parseCSVLine(line).map(h => h.replace(/^\uFEFF/, '').trim());
        isFirst = false;
      } else {
        const values = this.parseCSVLine(line);
        const obj: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) {
          obj[headers[i]] = values[i] ?? '';
        }
        onRow(obj);
      }
    }
  }

  private computeFootpaths(): void {
    console.time('[CSA] Compute Footpaths');
    const MAX_TRANSFER_METERS = 300;
    const WALK_SPEED = 1.4; // m/s
    const n = this.stopList.length;
    this.footpathsByStopIdx = new Array(n);

    for (let i = 0; i < n; i++) {
      const s1 = this.stopList[i];
      const paths: IndexedFootpath[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const s2 = this.stopList[j];
        const latDiff = Math.abs(s1.lat - s2.lat);
        const lonDiff = Math.abs(s1.lon - s2.lon);
        if (latDiff > 0.005 || lonDiff > 0.005) continue;

        const dist = this.getDistanceMeters(s1.lat, s1.lon, s2.lat, s2.lon);
        if (dist <= MAX_TRANSFER_METERS) {
          paths.push({ toIdx: j, walkTime: Math.round(dist / WALK_SPEED) });
        }
      }
      this.footpathsByStopIdx[i] = paths;
    }
    console.timeEnd('[CSA] Compute Footpaths');
  }

  private buildTypedConnectionColumns(
    rawDepStop: number[],
    rawArrStop: number[],
    rawDepTime: number[],
    rawArrTime: number[],
    rawTripIdx: number[]
  ): void {
    const n = rawDepTime.length;
    this.numConnections = n;

    // Sort indices for forward connections (ascending by depTime)
    const fwdOrder = new Int32Array(n);
    for (let i = 0; i < n; i++) fwdOrder[i] = i;
    fwdOrder.sort((a, b) => rawDepTime[a] - rawDepTime[b]);

    this.fwdDepStop = new Int32Array(n);
    this.fwdArrStop = new Int32Array(n);
    this.fwdDepTime = new Int32Array(n);
    this.fwdArrTime = new Int32Array(n);
    this.fwdTripIdx = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      const idx = fwdOrder[i];
      this.fwdDepStop[i] = rawDepStop[idx];
      this.fwdArrStop[i] = rawArrStop[idx];
      this.fwdDepTime[i] = rawDepTime[idx];
      this.fwdArrTime[i] = rawArrTime[idx];
      this.fwdTripIdx[i] = rawTripIdx[idx];
    }

    // Sort indices for backward connections (descending by arrTime)
    const bwdOrder = new Int32Array(n);
    for (let i = 0; i < n; i++) bwdOrder[i] = i;
    bwdOrder.sort((a, b) => rawArrTime[b] - rawArrTime[a]);

    this.bwdDepStop = new Int32Array(n);
    this.bwdArrStop = new Int32Array(n);
    this.bwdDepTime = new Int32Array(n);
    this.bwdArrTime = new Int32Array(n);
    this.bwdTripIdx = new Int32Array(n);

    for (let i = 0; i < n; i++) {
      const idx = bwdOrder[i];
      this.bwdDepStop[i] = rawDepStop[idx];
      this.bwdArrStop[i] = rawArrStop[idx];
      this.bwdDepTime[i] = rawDepTime[idx];
      this.bwdArrTime[i] = rawArrTime[idx];
      this.bwdTripIdx[i] = rawTripIdx[idx];
    }
  }

  public async loadFromGTFSFiles(dataDir: string): Promise<boolean> {
    const datasets = [
      { folder: 'LINZ_AG_GTFS_2026', prefix: 'LINZ_' },
      { folder: 'OOEVV_GTFS_2026', prefix: 'OOEVV_' }
    ];

    const resolvedDirs: Array<{ dir: string; prefix: string }> = [];
    for (const ds of datasets) {
      const dir = this.ensureDatasetExtracted(dataDir, ds.folder);
      if (dir) resolvedDirs.push({ dir, prefix: ds.prefix });
    }

    if (resolvedDirs.length === 0) return false;

    const latestMtime = this.getDatasetsLatestMtime(resolvedDirs.map(d => d.dir));
    if (this.tryLoadFromDiskCache(dataDir, latestMtime)) {
      return true;
    }

    console.log(`[CSA] Building routing graph directly from GTFS files in ${dataDir}...`);
    console.time('[CSA] Direct GTFS build');

    this.stopList = [];
    this.stopIdToIdx.clear();
    this.tripList = [];
    this.tripIdToIdx.clear();
    this.serviceList = [];
    this.serviceIdToIdx.clear();

    // Default catch-all service at index 0
    this.serviceList.push({
      id: '__ALL__',
      daysMask: 0b1111111,
      startDate: 19700101,
      endDate: 20991231,
      addedDates: new Set(),
      removedDates: new Set()
    });
    this.serviceIdToIdx.set('__ALL__', 0);

    const rawDepStop: number[] = [];
    const rawArrStop: number[] = [];
    const rawDepTime: number[] = [];
    const rawArrTime: number[] = [];
    const rawTripIdx: number[] = [];

    for (const { dir, prefix } of resolvedDirs) {
      // 1. Stops
      await this.streamCSV(path.join(dir, 'stops.txt'), (row) => {
        const id = prefix + row.stop_id;
        const lat = parseFloat(row.stop_lat);
        const lon = parseFloat(row.stop_lon);
        if (!row.stop_id || Number.isNaN(lat) || Number.isNaN(lon)) return;
        if (!this.stopIdToIdx.has(id)) {
          const idx = this.stopList.length;
          this.stopList.push({ id, name: row.stop_name || id, lat, lon, idx });
          this.stopIdToIdx.set(id, idx);
        }
      });

      // 2. Routes
      const routeMap = new Map<string, { shortName: string; longName: string; type: number }>();
      await this.streamCSV(path.join(dir, 'routes.txt'), (row) => {
        if (!row.route_id) return;
        const parsedType = parseInt(row.route_type, 10);
        routeMap.set(prefix + row.route_id, {
          shortName: row.route_short_name || '',
          longName: row.route_long_name || '',
          type: Number.isNaN(parsedType) ? 3 : parsedType
        });
      });

      // 3. Calendar
      await this.streamCSV(path.join(dir, 'calendar.txt'), (row) => {
        if (!row.service_id) return;
        const id = prefix + row.service_id;
        let mask = 0;
        if (row.sunday === '1') mask |= (1 << 0);
        if (row.monday === '1') mask |= (1 << 1);
        if (row.tuesday === '1') mask |= (1 << 2);
        if (row.wednesday === '1') mask |= (1 << 3);
        if (row.thursday === '1') mask |= (1 << 4);
        if (row.friday === '1') mask |= (1 << 5);
        if (row.saturday === '1') mask |= (1 << 6);

        const startDate = parseInt(row.start_date, 10) || 19700101;
        const endDate = parseInt(row.end_date, 10) || 20991231;

        if (!this.serviceIdToIdx.has(id)) {
          const idx = this.serviceList.length;
          this.serviceList.push({
            id,
            daysMask: mask,
            startDate,
            endDate,
            addedDates: new Set(),
            removedDates: new Set()
          });
          this.serviceIdToIdx.set(id, idx);
        }
      });

      // 4. Calendar dates (exceptions)
      await this.streamCSV(path.join(dir, 'calendar_dates.txt'), (row) => {
        if (!row.service_id || !row.date) return;
        const id = prefix + row.service_id;
        let svcIdx = this.serviceIdToIdx.get(id);
        if (svcIdx === undefined) {
          svcIdx = this.serviceList.length;
          this.serviceList.push({
            id,
            daysMask: 0,
            startDate: 19700101,
            endDate: 20991231,
            addedDates: new Set(),
            removedDates: new Set()
          });
          this.serviceIdToIdx.set(id, svcIdx);
        }
        const dateInt = parseInt(row.date, 10);
        if (Number.isNaN(dateInt)) return;
        if (row.exception_type === '1') {
          this.serviceList[svcIdx].addedDates.add(dateInt);
        } else if (row.exception_type === '2') {
          this.serviceList[svcIdx].removedDates.add(dateInt);
        }
      });

      // 5. Trips
      await this.streamCSV(path.join(dir, 'trips.txt'), (row) => {
        if (!row.trip_id) return;
        const id = prefix + row.trip_id;
        const routeInfo = routeMap.get(prefix + row.route_id);
        const svcIdx = this.serviceIdToIdx.get(prefix + row.service_id) ?? 0;
        if (!this.tripIdToIdx.has(id)) {
          const idx = this.tripList.length;
          this.tripList.push({
            id,
            route_short_name: routeInfo?.shortName || '',
            route_long_name: routeInfo?.longName || '',
            route_type: routeInfo?.type ?? 3,
            serviceIdx: svcIdx
          });
          this.tripIdToIdx.set(id, idx);
        }
      });

      // 6. Stop times -> build consecutive connections per trip
      const stopTimesByTrip = new Map<number, Array<{ seq: number; stopIdx: number; arr: number; dep: number }>>();
      await this.streamCSV(path.join(dir, 'stop_times.txt'), (row) => {
        const tripIdx = this.tripIdToIdx.get(prefix + row.trip_id);
        const stopIdx = this.stopIdToIdx.get(prefix + row.stop_id);
        if (tripIdx === undefined || stopIdx === undefined) return;
        const seq = parseInt(row.stop_sequence, 10);
        const arr = this.timeToSeconds(row.arrival_time);
        const dep = this.timeToSeconds(row.departure_time);
        if (Number.isNaN(seq) || arr === -1 || dep === -1) return;

        let list = stopTimesByTrip.get(tripIdx);
        if (!list) {
          list = [];
          stopTimesByTrip.set(tripIdx, list);
        }
        list.push({ seq, stopIdx, arr, dep });
      });

      for (const [tripIdx, list] of stopTimesByTrip.entries()) {
        if (list.length < 2) continue;
        list.sort((a, b) => a.seq - b.seq);
        for (let i = 0; i < list.length - 1; i++) {
          const st1 = list[i];
          const st2 = list[i + 1];
          rawDepStop.push(st1.stopIdx);
          rawArrStop.push(st2.stopIdx);
          rawDepTime.push(st1.dep);
          rawArrTime.push(st2.arr);
          rawTripIdx.push(tripIdx);
        }
      }
      stopTimesByTrip.clear();
    }

    this.computeFootpaths();
    this.buildTypedConnectionColumns(rawDepStop, rawArrStop, rawDepTime, rawArrTime, rawTripIdx);

    this.activeServiceCache.clear();
    this.ready = true;
    console.timeEnd('[CSA] Direct GTFS build');
    console.log(`[CSA] Direct GTFS graph ready. Stops: ${this.stopList.length}, Trips: ${this.tripList.length}, Services: ${this.serviceList.length}, Connections: ${this.numConnections}`);

    this.saveToDiskCache(dataDir, latestMtime);
    return true;
  }

  async loadGraph() {
    console.time('[CSA] Total load time');
    try {
      const dataDir = this.resolveDataDir();
      if (dataDir) {
        const loadedDirect = await this.loadFromGTFSFiles(dataDir);
        if (loadedDirect) {
          return;
        }
      }

      console.error('[CSA] Failed to load routing graph: no local GTFS data found');
      this.ready = false;
    } finally {
      console.timeEnd('[CSA] Total load time');
    }
  }

  public getActiveServiceMask(targetDate?: Date | string): Uint8Array {
    let dateObj: Date;
    if (typeof targetDate === 'string' && /^\d{8}$/.test(targetDate)) {
      const y = parseInt(targetDate.slice(0, 4), 10);
      const m = parseInt(targetDate.slice(4, 6), 10) - 1;
      const d = parseInt(targetDate.slice(6, 8), 10);
      dateObj = new Date(y, m, d, 12, 0, 0);
    } else if (targetDate instanceof Date) {
      dateObj = targetDate;
    } else {
      const now = new Date();
      dateObj = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Vienna' }));
    }

    const yyyy = dateObj.getFullYear();
    const mm = dateObj.getMonth() + 1;
    const dd = dateObj.getDate();
    const dateInt = yyyy * 10000 + mm * 100 + dd;
    const dayBit = 1 << dateObj.getDay();

    const cached = this.activeServiceCache.get(dateInt);
    if (cached) return cached;

    const numServices = this.serviceList.length;
    const active = new Uint8Array(numServices);
    active[0] = 1; // __ALL__

    let matchedCount = 0;
    for (let i = 1; i < numServices; i++) {
      const sv = this.serviceList[i];
      if (sv.removedDates.has(dateInt)) {
        active[i] = 0;
        continue;
      }
      if (sv.addedDates.has(dateInt)) {
        active[i] = 1;
        matchedCount++;
        continue;
      }
      if (dateInt >= sv.startDate && dateInt <= sv.endDate && (sv.daysMask & dayBit) !== 0) {
        active[i] = 1;
        matchedCount++;
      }
    }

    // Fallback 1: if system date is outside the GTFS calendar window, match by day-of-week only
    if (matchedCount === 0 && numServices > 1) {
      for (let i = 1; i < numServices; i++) {
        if ((this.serviceList[i].daysMask & dayBit) !== 0) {
          active[i] = 1;
          matchedCount++;
        }
      }
    }

    // Fallback 2: if still 0 (e.g., empty calendar), enable all services
    if (matchedCount === 0) {
      active.fill(1);
    }

    this.activeServiceCache.set(dateInt, active);
    return active;
  }

  private getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  public findStopsWithinRadius(lat: number, lon: number, maxMeters: number): Array<{ stop: StopData; walkTime: number }> {
    const WALK_SPEED_M_S = 1.4;
    // Bounding-box pre-filter (~111km per deg lat, ~74km per deg lon at 48°N, with 20% safety margin)
    const latDelta = (maxMeters / 111000) * 1.2;
    const lonDelta = (maxMeters / 70000) * 1.2;

    const results: Array<{ stop: StopData; walkTime: number }> = [];
    const n = this.stopList.length;

    for (let i = 0; i < n; i++) {
      const stop = this.stopList[i];
      if (Math.abs(stop.lat - lat) > latDelta || Math.abs(stop.lon - lon) > lonDelta) {
        continue;
      }
      const dist = this.getDistanceMeters(lat, lon, stop.lat, stop.lon);
      if (dist <= maxMeters) {
        results.push({ stop, walkTime: Math.round(dist / WALK_SPEED_M_S) });
      }
    }

    if (results.length === 0 && n > 0) {
      let nearest: StopData | null = null;
      let minDist = Infinity;
      for (let i = 0; i < n; i++) {
        const stop = this.stopList[i];
        const dist = this.getDistanceMeters(lat, lon, stop.lat, stop.lon);
        if (dist < minDist) {
          minDist = dist;
          nearest = stop;
        }
      }
      if (nearest) {
        results.push({ stop: nearest, walkTime: Math.round(minDist / WALK_SPEED_M_S) });
      }
    }

    return results;
  }

  /**
   * Binary search for first index i in fwdDepTime where fwdDepTime[i] >= startTime
   */
  public findFirstDepartureIndex(startTime: number): number {
    const arr = this.fwdDepTime;
    let lo = 0;
    let hi = this.numConnections;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < startTime) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Binary search for first index i in bwdArrTime (sorted descending) where bwdArrTime[i] <= targetTime
   */
  public findFirstArrivalReverseIndex(targetTime: number): number {
    const arr = this.bwdArrTime;
    let lo = 0;
    let hi = this.numConnections;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] > targetTime) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  findRoute(startLat: number, startLon: number, endLat: number, endLon: number, startTimeStr: string, targetDate?: Date | string): any {
    if (!this.ready) throw new Error('CSA Router not initialized');

    const startTime = this.timeToSeconds(startTimeStr);
    const MAX_WALK_METERS = 1500;
    const TRANSFER_PENALTY = 120; // 2 minutes added to footpaths to penalize transfers
    const INF = 0x3fffffff;

    const directWalkDist = this.getDistanceMeters(startLat, startLon, endLat, endLon);
    const directWalkTime = Math.round(directWalkDist / 1.4);

    const startStops = this.findStopsWithinRadius(startLat, startLon, MAX_WALK_METERS);
    const endStops = this.findStopsWithinRadius(endLat, endLon, MAX_WALK_METERS);

    if (startStops.length === 0 || endStops.length === 0) {
      return [];
    }

    const numStops = this.stopList.length;
    const numTrips = this.tripList.length;
    const activeService = this.getActiveServiceMask(targetDate);

    const earliestArrivalTime = new Int32Array(numStops).fill(INF);
    const earliestArrivalTransfers = new Int32Array(numStops).fill(INF);
    const walkToStart = new Int32Array(numStops).fill(-1);
    const endStopWalk = new Int32Array(numStops).fill(-1);
    const tripBoardStop = new Int32Array(numTrips).fill(-1);

    const inConnection = new Map<number, any>();
    const tripPrevConnection = new Map<number, number>(); // key: tripIdx * numStops + arrStopIdx -> connIdx

    for (let i = 0; i < endStops.length; i++) {
      const { stop, walkTime } = endStops[i];
      if (endStopWalk[stop.idx] === -1 || walkTime < endStopWalk[stop.idx]) {
        endStopWalk[stop.idx] = walkTime;
      }
    }

    let bestTotalTime = INF;
    let bestEndStopIdx = -1;
    let finalWalkTime = 0;

    for (let i = 0; i < startStops.length; i++) {
      const { stop, walkTime } = startStops[i];
      const arr = startTime + walkTime;
      if (arr < earliestArrivalTime[stop.idx]) {
        earliestArrivalTime[stop.idx] = arr;
        earliestArrivalTransfers[stop.idx] = 0;
        walkToStart[stop.idx] = walkTime;
        const ew = endStopWalk[stop.idx];
        if (ew !== -1 && arr + ew < bestTotalTime) {
          bestTotalTime = arr + ew;
          bestEndStopIdx = stop.idx;
          finalWalkTime = ew;
        }
      }
    }

    const startIdx = this.findFirstDepartureIndex(startTime);
    const n = this.numConnections;
    const fwdDepStop = this.fwdDepStop;
    const fwdArrStop = this.fwdArrStop;
    const fwdDepTime = this.fwdDepTime;
    const fwdArrTime = this.fwdArrTime;
    const fwdTripIdx = this.fwdTripIdx;
    const tripList = this.tripList;
    const footpathsByStopIdx = this.footpathsByStopIdx;

    for (let i = startIdx; i < n; i++) {
      const depTime = fwdDepTime[i];
      if (depTime > bestTotalTime) {
        break; // Early exit: sorted by departure_time, no subsequent connection can arrive before bestTotalTime
      }

      const tripIdx = fwdTripIdx[i];
      if (activeService[tripList[tripIdx].serviceIdx] === 0) {
        continue;
      }

      const depStopIdx = fwdDepStop[i];
      const depArrTime = earliestArrivalTime[depStopIdx];
      const wasReached = tripBoardStop[tripIdx] !== -1;

      if (depArrTime <= depTime || wasReached) {
        if (!wasReached) {
          tripBoardStop[tripIdx] = depStopIdx;
        }
        const arrStopIdx = fwdArrStop[i];
        tripPrevConnection.set(tripIdx * numStops + arrStopIdx, i);

        const arrTime = fwdArrTime[i];
        const newTransfers = wasReached ? earliestArrivalTransfers[depStopIdx] : earliestArrivalTransfers[depStopIdx] + 1;
        const curArrTime = earliestArrivalTime[arrStopIdx];

        if (arrTime < curArrTime || (arrTime === curArrTime && newTransfers < earliestArrivalTransfers[arrStopIdx])) {
          earliestArrivalTime[arrStopIdx] = arrTime;
          earliestArrivalTransfers[arrStopIdx] = newTransfers;
          inConnection.set(arrStopIdx, i);

          const ew = endStopWalk[arrStopIdx];
          if (ew !== -1 && arrTime + ew < bestTotalTime) {
            bestTotalTime = arrTime + ew;
            bestEndStopIdx = arrStopIdx;
            finalWalkTime = ew;
          }

          const paths = footpathsByStopIdx[arrStopIdx];
          for (let p = 0; p < paths.length; p++) {
            const fp = paths[p];
            const walkArr = arrTime + fp.walkTime + TRANSFER_PENALTY;
            const fpTo = fp.toIdx;
            const fpCurTime = earliestArrivalTime[fpTo];
            if (walkArr < fpCurTime || (walkArr === fpCurTime && newTransfers + 1 < earliestArrivalTransfers[fpTo])) {
              earliestArrivalTime[fpTo] = walkArr;
              earliestArrivalTransfers[fpTo] = newTransfers + 1;
              inConnection.set(fpTo, {
                type: 'footpath',
                fromIdx: arrStopIdx,
                toIdx: fpTo,
                walkTime: fp.walkTime,
                connectionTime: arrTime
              });

              const fpEw = endStopWalk[fpTo];
              if (fpEw !== -1 && walkArr + fpEw < bestTotalTime) {
                bestTotalTime = walkArr + fpEw;
                bestEndStopIdx = fpTo;
                finalWalkTime = fpEw;
              }
            }
          }
        }
      }
    }

    if (bestTotalTime === INF || bestEndStopIdx === -1) {
      const MAX_WALK_ONLY_METERS = 3000;
      if (directWalkDist <= MAX_WALK_ONLY_METERS) {
        const arrTime = startTime + directWalkTime;
        return [{
          legs: [{
            board_stop_id: 'START', board_stop_name: 'Origin',
            alight_stop_id: 'END', alight_stop_name: 'Destination',
            departure_time: this.secondsToTime(startTime),
            arrival_time: this.secondsToTime(arrTime),
            route_short_name: 'Walk', route_long_name: 'Walking',
            route_type: 99,
            distance: directWalkDist
          }],
          total_duration_minutes: Math.round(directWalkTime / 60),
          departure_time: this.secondsToTime(startTime),
          arrival_time: this.secondsToTime(arrTime),
          num_transfers: 0
        }];
      }
      return [];
    }

    const transitTotalTime = bestTotalTime - startTime;
    if (directWalkTime < transitTotalTime) {
      const arrTime = startTime + directWalkTime;
      return [{
        legs: [{
          board_stop_id: 'START', board_stop_name: 'Origin',
          alight_stop_id: 'END', alight_stop_name: 'Destination',
          departure_time: this.secondsToTime(startTime),
          arrival_time: this.secondsToTime(arrTime),
          route_short_name: 'Walk', route_long_name: 'Walking',
          route_type: 99,
          distance: directWalkDist
        }],
        total_duration_minutes: Math.round(directWalkTime / 60),
        departure_time: this.secondsToTime(startTime),
        arrival_time: this.secondsToTime(arrTime),
        num_transfers: 0
      }];
    }

    const rawPath: Array<any> = [];
    let currentStopIdx = bestEndStopIdx;
    let currentItem = inConnection.get(currentStopIdx);

    while (currentItem !== undefined) {
      if (typeof currentItem === 'object' && currentItem.type === 'footpath') {
        rawPath.unshift(currentItem);
        currentStopIdx = currentItem.fromIdx;
        currentItem = inConnection.get(currentStopIdx);
      } else {
        const connIdx = currentItem as number;
        const tripIdx = fwdTripIdx[connIdx];
        const boardStopIdx = tripBoardStop[tripIdx];

        let tempStop = currentStopIdx;
        let count = 0;
        while (tempStop !== boardStopIdx) {
          const cIdx = tripPrevConnection.get(tripIdx * numStops + tempStop);
          if (cIdx === undefined) break;
          rawPath.unshift({
            type: 'conn',
            depStopIdx: fwdDepStop[cIdx],
            arrStopIdx: fwdArrStop[cIdx],
            depTime: fwdDepTime[cIdx],
            arrTime: fwdArrTime[cIdx],
            tripIdx: fwdTripIdx[cIdx]
          });
          tempStop = fwdDepStop[cIdx];
          count++;
          if (count > 100) break;
        }
        currentStopIdx = boardStopIdx;
        currentItem = inConnection.get(currentStopIdx);
      }
      if (rawPath.length > 200) break;
    }

    const groupedLegs: any[] = [];
    const firstTransitStopIdx = rawPath.length > 0
      ? (rawPath[0].type === 'footpath' ? rawPath[0].fromIdx : rawPath[0].depStopIdx)
      : bestEndStopIdx;
    const initialWalk = walkToStart[firstTransitStopIdx];

    if (initialWalk > 0) {
      const firstStop = this.stopList[firstTransitStopIdx];
      groupedLegs.push({
        board_stop_id: 'START',
        board_stop_name: 'Origin',
        alight_stop_id: firstStop.id,
        alight_stop_name: firstStop.name,
        departure_time: this.secondsToTime(startTime),
        arrival_time: this.secondsToTime(startTime + initialWalk),
        route_short_name: 'Walk',
        route_long_name: 'Walking',
        route_type: 99,
        distance: Math.round(initialWalk * 1.4)
      });
    }

    const pushTransitLeg = (startLeg: any, lastLeg: any, tripIdx: number) => {
      const tripInfo = this.tripList[tripIdx];
      const boardStop = this.stopList[startLeg.depStopIdx];
      const alightStop = this.stopList[lastLeg.arrStopIdx];
      groupedLegs.push({
        board_stop_id: boardStop.id,
        board_stop_name: boardStop.name,
        alight_stop_id: alightStop.id,
        alight_stop_name: alightStop.name,
        departure_time: this.secondsToTime(startLeg.depTime),
        arrival_time: this.secondsToTime(lastLeg.arrTime),
        route_short_name: tripInfo.route_short_name,
        route_long_name: tripInfo.route_long_name,
        route_type: tripInfo.route_type
      });
    };

    if (rawPath.length > 0) {
      let currentTrip: number | null = rawPath[0].type === 'conn' ? rawPath[0].tripIdx : null;
      let startLeg = rawPath[0];
      let lastLeg = rawPath[0];

      for (let i = 1; i < rawPath.length; i++) {
        const item = rawPath[i];
        if (item.type === 'footpath') {
          if (currentTrip !== null) {
            pushTransitLeg(startLeg, lastLeg, currentTrip);
            currentTrip = null;
          }
          const fromStop = this.stopList[item.fromIdx];
          const toStop = this.stopList[item.toIdx];
          groupedLegs.push({
            board_stop_id: fromStop.id,
            board_stop_name: fromStop.name,
            alight_stop_id: toStop.id,
            alight_stop_name: toStop.name,
            departure_time: this.secondsToTime(item.connectionTime),
            arrival_time: this.secondsToTime(item.connectionTime + item.walkTime),
            route_short_name: 'Walk',
            route_long_name: 'Transfer',
            route_type: 99,
            distance: Math.round(item.walkTime * 1.4)
          });
        } else {
          if (item.tripIdx === currentTrip) {
            lastLeg = item;
          } else {
            if (currentTrip !== null) {
              pushTransitLeg(startLeg, lastLeg, currentTrip);
            }
            currentTrip = item.tripIdx;
            startLeg = item;
            lastLeg = item;
          }
        }
      }
      if (currentTrip !== null) {
        pushTransitLeg(startLeg, lastLeg, currentTrip);
      }
    }

    if (finalWalkTime > 0) {
      const lastArrivalTime = earliestArrivalTime[bestEndStopIdx];
      const endStop = this.stopList[bestEndStopIdx];
      const boardStopIdx = rawPath.length > 0
        ? (rawPath[rawPath.length - 1].type === 'footpath' ? rawPath[rawPath.length - 1].toIdx : rawPath[rawPath.length - 1].arrStopIdx)
        : bestEndStopIdx;
      groupedLegs.push({
        board_stop_id: this.stopList[boardStopIdx].id,
        board_stop_name: endStop.name,
        alight_stop_id: 'END',
        alight_stop_name: 'Destination',
        departure_time: this.secondsToTime(lastArrivalTime),
        arrival_time: this.secondsToTime(lastArrivalTime + finalWalkTime),
        route_short_name: 'Walk',
        route_long_name: 'Walking',
        route_type: 99,
        distance: Math.round(finalWalkTime * 1.4)
      });
    }

    return [{
      legs: groupedLegs,
      total_duration_minutes: Math.round((bestTotalTime - startTime) / 60),
      departure_time: this.secondsToTime(startTime),
      arrival_time: this.secondsToTime(bestTotalTime),
      num_transfers: Math.max(0, groupedLegs.filter(l => l.route_type !== 99).length - 1)
    }];
  }

  findReverseRoute(startLat: number, startLon: number, endLat: number, endLon: number, targetTimeStr: string, targetDate?: Date | string): any {
    if (!this.ready) throw new Error('CSA Router not initialized');

    const targetTime = this.timeToSeconds(targetTimeStr);
    const MAX_WALK_METERS = 1500;
    const TRANSFER_PENALTY = 120;
    const NEG_INF = -0x3fffffff;
    const INF = 0x3fffffff;

    const directWalkDist = this.getDistanceMeters(startLat, startLon, endLat, endLon);
    const directWalkTime = Math.round(directWalkDist / 1.4);

    const startStops = this.findStopsWithinRadius(startLat, startLon, MAX_WALK_METERS);
    const endStops = this.findStopsWithinRadius(endLat, endLon, MAX_WALK_METERS);

    if (startStops.length === 0 || endStops.length === 0) {
      return [];
    }

    const numStops = this.stopList.length;
    const numTrips = this.tripList.length;
    const activeService = this.getActiveServiceMask(targetDate);

    const latestDepartureTime = new Int32Array(numStops).fill(NEG_INF);
    const latestDepartureTransfers = new Int32Array(numStops).fill(INF);
    const walkToEnd = new Int32Array(numStops).fill(-1);
    const startStopWalk = new Int32Array(numStops).fill(-1);
    const tripAlightStop = new Int32Array(numTrips).fill(-1);

    const outConnection = new Map<number, any>();
    const tripNextConnection = new Map<number, number>(); // key: tripIdx * numStops + depStopIdx -> connIdx

    for (let i = 0; i < startStops.length; i++) {
      const { stop, walkTime } = startStops[i];
      if (startStopWalk[stop.idx] === -1 || walkTime < startStopWalk[stop.idx]) {
        startStopWalk[stop.idx] = walkTime;
      }
    }

    let bestTotalTime = NEG_INF;
    let bestStartStopIdx = -1;
    let initialWalkTime = 0;

    for (let i = 0; i < endStops.length; i++) {
      const { stop, walkTime } = endStops[i];
      const dep = targetTime - walkTime;
      if (dep > latestDepartureTime[stop.idx]) {
        latestDepartureTime[stop.idx] = dep;
        latestDepartureTransfers[stop.idx] = 0;
        walkToEnd[stop.idx] = walkTime;
        const sw = startStopWalk[stop.idx];
        if (sw !== -1 && dep - sw > bestTotalTime) {
          bestTotalTime = dep - sw;
          bestStartStopIdx = stop.idx;
          initialWalkTime = sw;
        }
      }
    }

    const startIdx = this.findFirstArrivalReverseIndex(targetTime);
    const n = this.numConnections;
    const bwdDepStop = this.bwdDepStop;
    const bwdArrStop = this.bwdArrStop;
    const bwdDepTime = this.bwdDepTime;
    const bwdArrTime = this.bwdArrTime;
    const bwdTripIdx = this.bwdTripIdx;
    const tripList = this.tripList;
    const footpathsByStopIdx = this.footpathsByStopIdx;

    for (let i = startIdx; i < n; i++) {
      const arrTime = bwdArrTime[i];
      if (arrTime < bestTotalTime) {
        break; // Early exit: sorted descending by arrival_time, no subsequent connection can depart after bestTotalTime
      }

      const tripIdx = bwdTripIdx[i];
      if (activeService[tripList[tripIdx].serviceIdx] === 0) {
        continue;
      }

      const arrStopIdx = bwdArrStop[i];
      const arrLatestDep = latestDepartureTime[arrStopIdx];
      const wasReached = tripAlightStop[tripIdx] !== -1;

      if (arrLatestDep >= arrTime || wasReached) {
        if (!wasReached) {
          tripAlightStop[tripIdx] = arrStopIdx;
        }
        const depStopIdx = bwdDepStop[i];
        // Only record reachable connections!
        tripNextConnection.set(tripIdx * numStops + depStopIdx, i);

        const depTime = bwdDepTime[i];
        const newTransfers = wasReached ? latestDepartureTransfers[arrStopIdx] : latestDepartureTransfers[arrStopIdx] + 1;
        const curDepTime = latestDepartureTime[depStopIdx];

        if (depTime > curDepTime || (depTime === curDepTime && newTransfers < latestDepartureTransfers[depStopIdx])) {
          latestDepartureTime[depStopIdx] = depTime;
          latestDepartureTransfers[depStopIdx] = newTransfers;
          outConnection.set(depStopIdx, i);

          const sw = startStopWalk[depStopIdx];
          if (sw !== -1 && depTime - sw > bestTotalTime) {
            bestTotalTime = depTime - sw;
            bestStartStopIdx = depStopIdx;
            initialWalkTime = sw;
          }

          const paths = footpathsByStopIdx[depStopIdx];
          for (let p = 0; p < paths.length; p++) {
            const fp = paths[p];
            const walkDep = depTime - fp.walkTime - TRANSFER_PENALTY;
            const fpFrom = fp.toIdx; // symmetric footpaths
            const fpCurDep = latestDepartureTime[fpFrom];
            if (walkDep > fpCurDep || (walkDep === fpCurDep && newTransfers + 1 < latestDepartureTransfers[fpFrom])) {
              latestDepartureTime[fpFrom] = walkDep;
              latestDepartureTransfers[fpFrom] = newTransfers + 1;
              outConnection.set(fpFrom, {
                type: 'footpath',
                fromIdx: fpFrom,
                toIdx: depStopIdx,
                walkTime: fp.walkTime,
                connectionTime: depTime
              });

              const fpSw = startStopWalk[fpFrom];
              if (fpSw !== -1 && walkDep - fpSw > bestTotalTime) {
                bestTotalTime = walkDep - fpSw;
                bestStartStopIdx = fpFrom;
                initialWalkTime = fpSw;
              }
            }
          }
        }
      }
    }

    if (bestTotalTime === NEG_INF || bestStartStopIdx === -1) {
      const MAX_WALK_ONLY_METERS = 3000;
      if (directWalkDist <= MAX_WALK_ONLY_METERS) {
        const directWalkDep = targetTime - directWalkTime;
        return [{
          legs: [{
            board_stop_id: 'START', board_stop_name: 'Origin',
            alight_stop_id: 'END', alight_stop_name: 'Destination',
            departure_time: this.secondsToTime(directWalkDep),
            arrival_time: this.secondsToTime(targetTime),
            route_short_name: 'Walk', route_long_name: 'Walking',
            route_type: 99,
            distance: directWalkDist
          }],
          total_duration_minutes: Math.round(directWalkTime / 60),
          departure_time: this.secondsToTime(directWalkDep),
          arrival_time: this.secondsToTime(targetTime),
          num_transfers: 0
        }];
      }
      return [];
    }

    const directWalkDep = targetTime - directWalkTime;
    if (directWalkDep > bestTotalTime) {
      return [{
        legs: [{
          board_stop_id: 'START', board_stop_name: 'Origin',
          alight_stop_id: 'END', alight_stop_name: 'Destination',
          departure_time: this.secondsToTime(directWalkDep),
          arrival_time: this.secondsToTime(targetTime),
          route_short_name: 'Walk', route_long_name: 'Walking',
          route_type: 99,
          distance: directWalkDist
        }],
        total_duration_minutes: Math.round(directWalkTime / 60),
        departure_time: this.secondsToTime(directWalkDep),
        arrival_time: this.secondsToTime(targetTime),
        num_transfers: 0
      }];
    }

    const rawPath: Array<any> = [];
    let currentStopIdx = bestStartStopIdx;
    let currentItem = outConnection.get(currentStopIdx);

    while (currentItem !== undefined) {
      if (typeof currentItem === 'object' && currentItem.type === 'footpath') {
        rawPath.push(currentItem);
        currentStopIdx = currentItem.toIdx;
        currentItem = outConnection.get(currentStopIdx);
      } else {
        const connIdx = currentItem as number;
        const tripIdx = bwdTripIdx[connIdx];
        const alightStopIdx = tripAlightStop[tripIdx];

        let tempStop = currentStopIdx;
        let count = 0;
        while (tempStop !== alightStopIdx) {
          const cIdx = tripNextConnection.get(tripIdx * numStops + tempStop);
          if (cIdx === undefined) break;
          rawPath.push({
            type: 'conn',
            depStopIdx: bwdDepStop[cIdx],
            arrStopIdx: bwdArrStop[cIdx],
            depTime: bwdDepTime[cIdx],
            arrTime: bwdArrTime[cIdx],
            tripIdx: bwdTripIdx[cIdx]
          });
          tempStop = bwdArrStop[cIdx];
          count++;
          if (count > 100) break;
        }
        currentStopIdx = alightStopIdx;
        currentItem = outConnection.get(currentStopIdx);
      }
      if (rawPath.length > 200) break;
    }

    const groupedLegs: any[] = [];

    if (initialWalkTime > 0) {
      const startStop = this.stopList[bestStartStopIdx];
      groupedLegs.push({
        board_stop_id: 'START',
        board_stop_name: 'Origin',
        alight_stop_id: startStop.id,
        alight_stop_name: startStop.name,
        departure_time: this.secondsToTime(bestTotalTime),
        arrival_time: this.secondsToTime(bestTotalTime + initialWalkTime),
        route_short_name: 'Walk',
        route_long_name: 'Walking',
        route_type: 99,
        distance: Math.round(initialWalkTime * 1.4)
      });
    }

    const pushTransitLeg = (startLeg: any, lastLeg: any, tripIdx: number) => {
      const tripInfo = this.tripList[tripIdx];
      const boardStop = this.stopList[startLeg.depStopIdx];
      const alightStop = this.stopList[lastLeg.arrStopIdx];
      groupedLegs.push({
        board_stop_id: boardStop.id,
        board_stop_name: boardStop.name,
        alight_stop_id: alightStop.id,
        alight_stop_name: alightStop.name,
        departure_time: this.secondsToTime(startLeg.depTime),
        arrival_time: this.secondsToTime(lastLeg.arrTime),
        route_short_name: tripInfo.route_short_name,
        route_long_name: tripInfo.route_long_name,
        route_type: tripInfo.route_type
      });
    };

    if (rawPath.length > 0) {
      let currentTrip: number | null = rawPath[0].type === 'conn' ? rawPath[0].tripIdx : null;
      let startLeg = rawPath[0];
      let lastLeg = rawPath[0];

      for (let i = 1; i < rawPath.length; i++) {
        const item = rawPath[i];
        if (item.type === 'footpath') {
          if (currentTrip !== null) {
            pushTransitLeg(startLeg, lastLeg, currentTrip);
            currentTrip = null;
          }
          const fromStop = this.stopList[item.fromIdx];
          const toStop = this.stopList[item.toIdx];
          groupedLegs.push({
            board_stop_id: fromStop.id,
            board_stop_name: fromStop.name,
            alight_stop_id: toStop.id,
            alight_stop_name: toStop.name,
            departure_time: this.secondsToTime(item.connectionTime - item.walkTime),
            arrival_time: this.secondsToTime(item.connectionTime),
            route_short_name: 'Walk',
            route_long_name: 'Transfer',
            route_type: 99,
            distance: Math.round(item.walkTime * 1.4)
          });
        } else {
          if (item.tripIdx === currentTrip) {
            lastLeg = item;
          } else {
            if (currentTrip !== null) {
              pushTransitLeg(startLeg, lastLeg, currentTrip);
            }
            currentTrip = item.tripIdx;
            startLeg = item;
            lastLeg = item;
          }
        }
      }
      if (currentTrip !== null) {
        pushTransitLeg(startLeg, lastLeg, currentTrip);
      }
    }

    const finalTransitStopIdx = rawPath.length > 0
      ? (rawPath[rawPath.length - 1].type === 'footpath' ? rawPath[rawPath.length - 1].toIdx : rawPath[rawPath.length - 1].arrStopIdx)
      : bestStartStopIdx;
    const finalWalk = walkToEnd[finalTransitStopIdx];
    if (finalWalk > 0) {
      const depTime = rawPath.length > 0
        ? (rawPath[rawPath.length - 1].type === 'footpath' ? rawPath[rawPath.length - 1].connectionTime : rawPath[rawPath.length - 1].arrTime)
        : (bestTotalTime + initialWalkTime);
      const finalStop = this.stopList[finalTransitStopIdx];
      groupedLegs.push({
        board_stop_id: finalStop.id,
        board_stop_name: finalStop.name,
        alight_stop_id: 'END',
        alight_stop_name: 'Destination',
        departure_time: this.secondsToTime(depTime),
        arrival_time: this.secondsToTime(depTime + finalWalk),
        route_short_name: 'Walk',
        route_long_name: 'Walking',
        route_type: 99,
        distance: Math.round(finalWalk * 1.4)
      });
    }

    const finalArrival = groupedLegs.length > 0 ? groupedLegs[groupedLegs.length - 1].arrival_time : this.secondsToTime(targetTime);
    const totalDurationSeconds = this.timeToSeconds(finalArrival) - bestTotalTime;

    return [{
      legs: groupedLegs,
      total_duration_minutes: Math.round(totalDurationSeconds / 60),
      departure_time: this.secondsToTime(bestTotalTime),
      arrival_time: finalArrival,
      num_transfers: Math.max(0, groupedLegs.filter(l => l.route_type !== 99).length - 1)
    }];
  }
}

export const globalCSARouter = new CSARouter();
