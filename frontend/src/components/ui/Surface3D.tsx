import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import type { TableData } from '@/types'

// Map a 0..1 value to a heatmap color (cold blue → green → amber → red)
function heatmapColor(t: number): THREE.Color {
  const stops: [number, number, number][] = [
    [0.118, 0.251, 0.686],  // blue
    [0.086, 0.639, 0.290],  // green
    [0.851, 0.467, 0.024],  // amber
    [0.863, 0.149, 0.149],  // red
  ]
  const seg = Math.min(Math.floor(t * 3), 2)
  const local = t * 3 - seg
  const [r1, g1, b1] = stops[seg]
  const [r2, g2, b2] = stops[seg + 1]
  return new THREE.Color(
    r1 + (r2 - r1) * local,
    g1 + (g2 - g1) * local,
    b1 + (b2 - b1) * local,
  )
}

interface SurfaceMeshProps {
  table: TableData
}

function SurfaceMesh({ table }: SurfaceMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  const { geometry } = useMemo(() => {
    const rows = table.rows
    const cols = table.cols
    const zFlat = table.z_values.flat()
    const zMin = Math.min(...zFlat)
    const zMax = Math.max(...zFlat)
    const zRange = zMax - zMin || 1

    // Normalized grid: X and Y span [0,1], Z spans [0,1]
    const geo = new THREE.BufferGeometry()
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c / (cols - 1) - 0.5      // -0.5 .. 0.5
        const z = r / (rows - 1) - 0.5      // -0.5 .. 0.5
        const rawZ = table.z_values[r][c]
        const y = ((rawZ - zMin) / zRange) * 0.6  // height 0..0.6

        positions.push(x, y, z)

        const color = heatmapColor((rawZ - zMin) / zRange)
        colors.push(color.r, color.g, color.b)
      }
    }

    // Build triangle indices
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c
        const b = r * cols + c + 1
        const d = (r + 1) * cols + c
        const e = (r + 1) * cols + c + 1
        indices.push(a, b, d)
        indices.push(b, e, d)
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    return { geometry: geo }
  }, [table])

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        side={THREE.DoubleSide}
        roughness={0.6}
        metalness={0.1}
      />
    </mesh>
  )
}

function WireframeMesh({ table }: SurfaceMeshProps) {
  const { geometry } = useMemo(() => {
    const rows = table.rows
    const cols = table.cols
    const zFlat = table.z_values.flat()
    const zMin = Math.min(...zFlat)
    const zMax = Math.max(...zFlat)
    const zRange = zMax - zMin || 1

    const geo = new THREE.BufferGeometry()
    const positions: number[] = []

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c / (cols - 1) - 0.5
        const z = r / (rows - 1) - 0.5
        const y = ((table.z_values[r][c] - zMin) / zRange) * 0.6
        positions.push(x, y, z)
      }
    }

    const indices: number[] = []
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c
        const b = r * cols + c + 1
        const d = (r + 1) * cols + c
        indices.push(a, b, b, d, d, a)
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    return { geometry: geo }
  }, [table])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#FF6B35" transparent opacity={0.25} />
    </lineSegments>
  )
}

interface Surface3DProps {
  table: TableData
}

export function Surface3D({ table }: Surface3DProps) {
  return (
    <div className="w-full h-full rounded-lg overflow-hidden bg-bg-base">
      <Canvas
        camera={{ position: [1.2, 0.9, 1.2], fov: 45 }}
        gl={{ antialias: true }}
        style={{ background: '#0A0A0F' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 4, 2]} intensity={1.2} color="#ffffff" />
        <directionalLight position={[-2, 2, -2]} intensity={0.4} color="#7090ff" />

        {/* Surface */}
        <SurfaceMesh table={table} />
        <WireframeMesh table={table} />

        {/* Controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          minDistance={0.8}
          maxDistance={4}
        />
      </Canvas>
    </div>
  )
}
