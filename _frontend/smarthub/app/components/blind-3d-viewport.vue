<template>
  <div class="blind-3d-wrap">
    <div ref="canvasContainer" class="blind-3d-canvas" aria-label="3D Window Blind and Sunlight Simulation"></div>

    <!-- Live Weather & Daylight Telemetry HUD Badges overlaid on the 3D scene -->
    <div class="blind-3d-badges">
      <div class="blind-3d-badge">
        <i :class="sunBadgeIcon" :style="{ color: sunBadgeColor }"></i>
        <span>Sun {{ Math.round(environment.sunElevation) }}° • {{ compassDirection }} ({{ Math.round(environment.sunAzimuth) }}°)</span>
      </div>
      <div class="blind-3d-badge">
        <i class="fa-solid fa-sun-plant-wilt"></i>
        <span>Out: {{ formattedOutdoorLux }} lx</span>
      </div>
      <div class="blind-3d-badge blind-3d-badge--indoor">
        <i class="fa-solid fa-house-chimney-window"></i>
        <span>In: ~{{ estimatedIndoorLux }} lx ({{ Math.round(lightTransmission * 100) }}%)</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import type { KnxEnvironmentDTO } from '../composables/use-smarthub-api'

const props = defineProps<{
  slatAnglePercent: number
  environment: KnxEnvironmentDTO
}>()

const canvasContainer = ref<HTMLElement | null>(null)

const slatTiltDeg = computed(() => Math.round((props.slatAnglePercent / 100) * 90))

const effectiveOutdoorLux = computed(() => {
  const west = props.environment?.luxWest ?? 15000
  const south = props.environment?.luxSouth ?? 15000
  return Math.max(west, Math.round(west * 0.7 + south * 0.3))
})

/**
 * Geometric light transmission factor (0..1) combining slat tilt angle (0..90 deg)
 * and solar elevation angle (-90..90 deg) relative to horizontal slats.
 */
const lightTransmission = computed(() => {
  const tiltRad = (slatTiltDeg.value * Math.PI) / 180
  const elevDeg = Math.max(0, props.environment?.sunElevation ?? 25)
  const elevRad = (elevDeg * Math.PI) / 180

  // Direct beam blockage increases as slat tilt aligns against incoming sun elevation
  const openCos = Math.cos(tiltRad)
  const angleDiff = Math.abs(tiltRad - elevRad * 0.65)
  const directBeam = Math.max(0, Math.cos(angleDiff) * openCos)
  // Diffuse sky bounce (~8% even when slats are nearly closed)
  const diffuse = 0.04 + 0.96 * Math.pow(openCos, 1.35)
  return Math.max(0.03, Math.min(1, directBeam * 0.55 + diffuse * 0.45))
})

const estimatedIndoorLux = computed(() => {
  // Window glazing & room factor ~18% of facade Lux when 100% open
  const raw = effectiveOutdoorLux.value * 0.18 * lightTransmission.value
  return Math.max(5, Math.round(raw))
})

const formattedOutdoorLux = computed(() => {
  const val = effectiveOutdoorLux.value
  if (val >= 1000) {
    return `${(val / 1000).toFixed(1)}k`
  }
  return String(val)
})

const compassDirection = computed(() => {
  const az = ((props.environment?.sunAzimuth ?? 240) % 360 + 360) % 360
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(az / 45) % 8] || 'W'
})

const sunBadgeIcon = computed(() => {
  if (props.environment?.raining) return 'fa-solid fa-cloud-showers-heavy'
  if ((props.environment?.sunElevation ?? 20) <= 0) return 'fa-solid fa-moon'
  return 'fa-solid fa-sun'
})

const sunBadgeColor = computed(() => {
  const elev = props.environment?.sunElevation ?? 25
  if (elev <= 0) return '#60a5fa'
  if (elev < 15) return '#f59e0b'
  return '#fbbf24'
})

// Three.js scene references
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let sunLight: THREE.DirectionalLight | null = null
let roomBounceLight: THREE.PointLight | null = null
let hemiLight: THREE.HemisphereLight | null = null
let skyBackdropMat: THREE.MeshBasicMaterial | null = null
let floorMat: THREE.MeshStandardMaterial | null = null
let wallMat: THREE.MeshStandardMaterial | null = null
const slatMeshes: THREE.Mesh[] = []

let animFrameId: number | null = null
let currentTiltRad = 0
let targetTiltRad = 0

function updateTargetFromProps() {
  // Convert 0..100% (0..90 deg) to radians (0 = flat horizontal, ~1.48 rad = closed)
  targetTiltRad = ((props.slatAnglePercent / 100) * 84 * Math.PI) / 180
  updateEnvironmentLighting()
}

function updateEnvironmentLighting() {
  if (!sunLight || !roomBounceLight || !hemiLight || !skyBackdropMat) return

  const elevDeg = props.environment?.sunElevation ?? 25
  const azDeg = props.environment?.sunAzimuth ?? 240
  const isDay = elevDeg > -2
  const elevRad = (Math.max(2, elevDeg) * Math.PI) / 180

  // KZ West window faces West/South-West (~245 deg normal).
  // Compute lateral sun offset relative to window normal (-60..+60 deg clamped for viewport clarity)
  const relAzDeg = Math.max(-55, Math.min(55, azDeg - 240))
  const relAzRad = (relAzDeg * Math.PI) / 180

  const dist = 7.5
  const sunY = Math.max(0.6, Math.sin(elevRad) * dist)
  const horizDist = Math.cos(elevRad) * dist
  const sunX = Math.sin(relAzRad) * horizDist
  const sunZ = -Math.cos(relAzRad) * horizDist

  sunLight.position.set(sunX, sunY, sunZ)
  sunLight.target.position.set(-sunX * 0.25, -1.0, 1.2)
  sunLight.target.updateMatrixWorld()

  // Normalize outdoor lux (0..60,000 lx) into a perceptual intensity curve
  const luxNorm = Math.min(1, Math.max(0.05, Math.log10(Math.max(10, effectiveOutdoorLux.value)) / 4.75))
  const trans = lightTransmission.value

  // Color temperature shifts with solar elevation
  const sunColor = new THREE.Color()
  const skyColor = new THREE.Color()
  if (!isDay) {
    sunColor.setHex(0x60a5fa)
    skyColor.setHex(0x0f172a)
  } else if (elevDeg < 14) {
    // Golden hour warm sunlight
    sunColor.setHex(0xff9e44)
    skyColor.setHex(0x38bdf8)
  } else {
    // Crisp daylight
    sunColor.setHex(0xfffbeb)
    skyColor.setHex(0x7dd3fc)
  }

  // Natural daylight direct illumination: balanced to avoid highlight clipping
  sunLight.color.copy(sunColor)
  sunLight.intensity = isDay ? (0.75 + luxNorm * 0.95) * (0.2 + 0.8 * trans) : 0.22

  // Interior room bounce scales directly with how much light passes through the slats
  roomBounceLight.color.copy(sunColor)
  roomBounceLight.intensity = isDay ? (0.08 + luxNorm * 0.42) * trans : 0.06

  hemiLight.color.copy(skyColor)
  hemiLight.intensity = isDay ? 0.35 + 0.35 * trans * luxNorm : 0.2

  skyBackdropMat.color.copy(skyColor).multiplyScalar(isDay ? 0.65 + 0.35 * luxNorm : 0.3)
}

function buildScene(container: HTMLElement) {
  const width = container.clientWidth || 300
  const height = container.clientHeight || 190

  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 30)
  camera.position.set(1.35, 0.35, 3.85)
  camera.lookAt(0, -0.08, 0.2)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.98

  container.innerHTML = ''
  container.appendChild(renderer.domElement)

  // 1. Outdoor Sky Backdrop behind window
  skyBackdropMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc })
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), skyBackdropMat)
  skyPlane.position.set(0, 0.07, -0.45)
  scene.add(skyPlane)

  // 2. Room Interior Surfaces (Floor, Walls, Window Casing) forming an enclosed 90° corner
  floorMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.72,
    metalness: 0.06,
  })
  // Floor extends from left wall (x = -1.27) into room (z = 0.18 to 4.2)
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.67, 4.02), floorMat)
  floorMesh.rotation.x = -Math.PI / 2
  floorMesh.position.set(1.065, -1.02, 2.19)
  floorMesh.receiveShadow = true
  scene.add(floorMesh)

  wallMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.85,
    metalness: 0.04,
  })

  // Left room wall: meets front wall at x = -1.27, extending into room along +Z
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(4.02, 3.02), wallMat)
  leftWall.rotation.y = Math.PI / 2
  leftWall.position.set(-1.27, 0.49, 2.19)
  leftWall.receiveShadow = true
  scene.add(leftWall)

  // Front room wall casing: enclosing window opening at z = 0.18
  // A. Top header wall above window (y from 1.02 to 2.0)
  const frontTopWall = new THREE.Mesh(new THREE.PlaneGeometry(4.67, 0.98), wallMat)
  frontTopWall.position.set(1.065, 1.51, 0.18)
  frontTopWall.receiveShadow = true
  scene.add(frontTopWall)

  // B. Bottom apron wall below window sill (y from -1.02 to -0.88)
  const frontBottomWall = new THREE.Mesh(new THREE.PlaneGeometry(4.67, 0.14), wallMat)
  frontBottomWall.position.set(1.065, -0.95, 0.18)
  frontBottomWall.receiveShadow = true
  scene.add(frontBottomWall)

  // C. Right flank wall (x from 1.27 to 3.4)
  const frontRightWall = new THREE.Mesh(new THREE.PlaneGeometry(2.13, 1.90), wallMat)
  frontRightWall.position.set(2.335, 0.07, 0.18)
  frontRightWall.receiveShadow = true
  scene.add(frontRightWall)

  // Window frame surround (Top Header, Bottom Sill, Left & Right jambs)
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.5,
    metalness: 0.15,
  })

  // Window Sill: flush against left wall (x = -1.27), rests atop lower apron, juts into room (+Z to 0.32)
  const sillMesh = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.10, 0.48), frameMat)
  sillMesh.position.set(0, -0.92, 0.08)
  sillMesh.receiveShadow = true
  sillMesh.castShadow = true
  scene.add(sillMesh)

  const headerMesh = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.10, 0.36), frameMat)
  headerMesh.position.set(0, 0.97, 0.02)
  headerMesh.castShadow = true
  scene.add(headerMesh)

  const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.90, 0.36), frameMat)
  leftJamb.position.set(-1.20, 0.07, 0.02)
  leftJamb.castShadow = true
  leftJamb.receiveShadow = true
  scene.add(leftJamb)

  const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.90, 0.36), frameMat)
  rightJamb.position.set(1.20, 0.07, 0.02)
  rightJamb.castShadow = true
  rightJamb.receiveShadow = true
  scene.add(rightJamb)

  // 3. Vertical Ladder Cords
  const cordMat = new THREE.MeshBasicMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.5,
  })
  for (const xPos of [-0.78, 0.78]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.80, 6), cordMat)
    cord.position.set(xPos, 0.05, 0)
    scene.add(cord)
  }

  // 4. Venetian Blind Slats (9 slats, matte PBR finish to eliminate harsh reflections)
  const slatCount = 9
  const slatGeom = new THREE.BoxGeometry(2.22, 0.024, 0.21)
  const slatMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.65,
    metalness: 0.08,
  })

  slatMeshes.length = 0

  const topY = 0.76
  const bottomY = -0.74
  const stepY = (topY - bottomY) / (slatCount - 1)

  for (let i = 0; i < slatCount; i++) {
    const y = topY - i * stepY
    const slat = new THREE.Mesh(slatGeom, slatMat)
    slat.position.set(0, y, 0)
    slat.castShadow = true
    slat.receiveShadow = true
    scene.add(slat)
    slatMeshes.push(slat)
  }

  // 5. Lights: Sun DirectionalLight (with shadow map), Room Bounce PointLight, Sky HemisphereLight
  hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x1e293b, 0.5)
  scene.add(hemiLight)

  sunLight = new THREE.DirectionalLight(0xfffbeb, 1.6)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.width = 1024
  sunLight.shadow.mapSize.height = 1024
  sunLight.shadow.camera.near = 0.5
  sunLight.shadow.camera.far = 16
  sunLight.shadow.camera.left = -2.2
  sunLight.shadow.camera.right = 2.2
  sunLight.shadow.camera.top = 2.2
  sunLight.shadow.camera.bottom = -2.2
  sunLight.shadow.bias = -0.0015
  scene.add(sunLight)
  scene.add(sunLight.target)

  roomBounceLight = new THREE.PointLight(0xfffbeb, 0.5, 6)
  roomBounceLight.position.set(0, 0.25, 1.45)
  scene.add(roomBounceLight)

  currentTiltRad = ((props.slatAnglePercent / 100) * 84 * Math.PI) / 180
  targetTiltRad = currentTiltRad
  for (const slat of slatMeshes) {
    slat.rotation.x = currentTiltRad
  }
  updateEnvironmentLighting()

  const animate = () => {
    animFrameId = requestAnimationFrame(animate)
    // Smooth 60fps critically damped interpolation toward target slat angle
    const diff = targetTiltRad - currentTiltRad
    if (Math.abs(diff) > 0.0005) {
      currentTiltRad += diff * 0.24
      for (const slat of slatMeshes) {
        slat.rotation.x = currentTiltRad
      }
      updateEnvironmentLighting()
    }
    if (renderer && scene && camera) {
      renderer.render(scene, camera)
    }
  }
  animate()
}

watch(
  () => [props.slatAnglePercent, props.environment],
  () => {
    updateTargetFromProps()
  },
  { deep: true }
)

onMounted(() => {
  if (canvasContainer.value) {
    buildScene(canvasContainer.value)
  }
})

onUnmounted(() => {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId)
    animFrameId = null
  }
  if (scene) {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) {
        mesh.geometry.dispose()
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose())
        } else {
          mesh.material.dispose()
        }
      }
    })
  }
  if (renderer) {
    renderer.dispose()
    renderer = null
  }
  scene = null
  camera = null
})
</script>

<style scoped>
.blind-3d-wrap {
  position: relative;
  width: 100%;
  height: 210px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  background: radial-gradient(circle at 30% 20%, #1e293b 0%, #0f172a 100%);
  box-shadow: inset 0 2px 12px rgba(0, 0, 0, 0.35);
}

.blind-3d-canvas {
  width: 100%;
  height: 100%;
}

.blind-3d-badges {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  pointer-events: none;
}

.blind-3d-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.76);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #f8fafc;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.blind-3d-badge--indoor {
  margin-left: auto;
  background: rgba(59, 130, 246, 0.28);
  border-color: rgba(96, 165, 250, 0.45);
  color: #eff6ff;
}
</style>
