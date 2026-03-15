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
    const rows = table.z_values.length
    const cols = table.z_values[0]?.length ?? 0
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
    const rows = table.z_values.length
    const cols = table.z_values[0]?.length ?? 0
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
  const flat = table.z_values.flat()
  const zMin = Math.min(...flat)
  const zMax = Math.max(...flat)
  const xVals = table.x_axis.values
  const yVals = table.y_axis?.values ?? []

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden">
      <Canvas
        camera={{ position: [1.2, 0.9, 1.2], fov: 45 }}
        gl={{ antialias: true }}
        style={{ background: '#0A0A0F', width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 4, 2]} intensity={1.2} color="#ffffff" />
        <directionalLight position={[-2, 2, -2]} intensity={0.4} color="#7090ff" />
        <SurfaceMesh table={table} />
        <WireframeMesh table={table} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.6}
          minDistance={0.8}
          maxDistance={4}
        />
      </Canvas>

      {/* Axis legend overlay */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between pointer-events-none">
        {/* Axis info */}
        <div className="bg-bg-base/80 backdrop-blur-sm rounded px-3 py-2 text-[11px] font-mono space-y-0.5">
          <div className="text-text-muted">
            X <span className="text-text-secondary">{table.x_axis.units}</span>
            {xVals.length > 0 && <span className="text-text-muted ml-1">{xVals[0]} – {xVals[xVals.length - 1]}</span>}
          </div>
          {yVals.length > 0 && (
            <div className="text-text-muted">
              Y <span className="text-text-secondary">{table.y_axis?.units}</span>
              <span className="text-text-muted ml-1">{yVals[0]} – {yVals[yVals.length - 1]}</span>
            </div>
          )}
          <div className="text-text-muted">
            Z <span className="text-text-secondary">{table.z_units}</span>
            <span className="text-text-muted ml-1">{zMin.toFixed(2)} – {zMax.toFixed(2)}</span>
          </div>
        </div>

        {/* Heatmap scale */}
        <div className="bg-bg-base/80 backdrop-blur-sm rounded px-3 py-2 text-[11px] font-mono flex items-center gap-2">
          <span className="text-blue-400">{zMin.toFixed(1)}</span>
          <div className="w-20 h-2 rounded" style={{
            background: 'linear-gradient(to right, #1E40AF, #16A34A, #D97706, #DC2626)'
          }} />
          <span className="text-red-400">{zMax.toFixed(1)}</span>
        </div>
      </div>

      <div className="absolute top-3 right-3 text-[10px] font-mono text-text-muted/50 pointer-events-none">
        drag to rotate · scroll to zoom
      </div>
    </div>
  )
}
