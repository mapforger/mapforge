import { useState } from 'react'
import { Search, Table2, SlidersHorizontal, GitCompare, Download, ChevronDown } from 'lucide-react'
import type { TableMeta } from '@/types'

interface SidebarProps {
  tables: TableMeta[]
  selectedId: string | null
  onSelect: (id: string) => void
  activeView: 'tables' | 'constants' | 'diff'
  onViewChange: (view: 'tables' | 'constants' | 'diff') => void
  modifiedCount: number
}

export function Sidebar({
  tables, selectedId, onSelect, activeView, onViewChange, modifiedCount
}: SidebarProps) {
  const [search, setSearch] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const filtered = tables.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase())
  )

  // Group by category
  const grouped = filtered.reduce<Record<string, TableMeta[]>>((acc, t) => {
    const cat = t.category || 'Uncategorized'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(t)
    return acc
  }, {})

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const allCategories = Object.keys(grouped)
  const displayGroups = allCategories.length === 1 && allCategories[0] === 'Uncategorized'
    ? null
    : grouped

  return (
    <aside className="w-64 flex flex-col bg-bg-surface border-r border-bg-border h-full">
      {/* Nav icons */}
      <nav className="flex border-b border-bg-border">
        {([
          { id: 'tables',    icon: Table2,          label: 'Tables'    },
          { id: 'constants', icon: SlidersHorizontal, label: 'Constants' },
          { id: 'diff',      icon: GitCompare,       label: 'Diff'      },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            title={label}
            className={`flex-1 flex items-center justify-center py-3 transition-colors duration-150
              ${activeView === id
                ? 'text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text-secondary'}`}
          >
            <Icon size={16} />
            {id === 'diff' && modifiedCount > 0 && (
              <span className="ml-1 bg-accent text-white text-[10px] font-mono px-1 rounded-full">
                {modifiedCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Search */}
      {activeView === 'tables' && (
        <div className="p-3 border-b border-bg-border">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              className="input w-full pl-8 py-1.5 text-sm"
              placeholder="Search tables…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Table list */}
      {activeView === 'tables' && (
        <div className="flex-1 overflow-y-auto py-2">
          {displayGroups ? (
            Object.entries(displayGroups).map(([cat, items]) => {
              const isOpen = expandedCategories.has(cat)
              return (
                <div key={cat}>
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-4 py-1.5
                               text-xs font-semibold text-text-muted uppercase tracking-wider
                               hover:text-text-secondary transition-colors"
                  >
                    {cat}
                    <ChevronDown
                      size={12}
                      className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && items.map(t => (
                    <TableItem key={t.id} table={t} selected={selectedId === t.id} onSelect={onSelect} />
                  ))}
                </div>
              )
            })
          ) : (
            filtered.map(t => (
              <TableItem key={t.id} table={t} selected={selectedId === t.id} onSelect={onSelect} />
            ))
          )}
          {filtered.length === 0 && (
            <p className="text-text-muted text-sm text-center py-8">No tables found</p>
          )}
        </div>
      )}

      {/* Bottom info */}
      <div className="p-3 border-t border-bg-border text-xs text-text-muted font-mono">
        {tables.length} tables
      </div>
    </aside>
  )
}

function TableItem({ table, selected, onSelect }: {
  table: TableMeta
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      onClick={() => onSelect(table.id)}
      className={`w-full text-left px-4 py-2 flex items-start gap-2 transition-colors duration-100
        ${selected
          ? 'bg-accent-muted text-text-primary border-r-2 border-accent'
          : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'}`}
    >
      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0
        ${table.is_3d ? 'bg-accent' : 'bg-text-muted'}`}
      />
      <span className="text-sm leading-snug">{table.title}</span>
    </button>
  )
}
