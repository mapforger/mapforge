import { createContext, useContext, useState } from 'react'

// ── Translations ──────────────────────────────────────────────────────────────

export const en = {
  // Diff
  nChanges:        (n: number) => `${n} change${n !== 1 ? 's' : ''}`,
  filterPlaceholder: 'Filter…',
  sortRecent:      'Recent',
  sortTable:       'Table',
  sortDelta:       'Largest Δ',
  row:             'row',
  col:             'col',
  noChangesTitle:  'No changes',
  noChangesDesc:   'Modify table values to see the diff here',
  // Constants
  noConstantsTitle: 'No constants',
  noConstantsDesc:  'This XDF has no constants defined',
  constantsHeading: 'Constants',
  // Toasts
  saveError:        (e: string) => `Save error: ${e}`,
  checksumFixed:    'Checksums fixed',
  checksumError:    (e: string) => `Checksum error: ${e}`,
  constantUpdated:  (name: string) => `${name} updated`,
  constantError:    (e: string) => `Error: ${e}`,
  exported:         (name: string) => `${name} exported`,
  exportError:      (e: string) => `Export error: ${e}`,
  // Checksum panel
  checksumTitle:    'Checksums',
  noBlocksDefined:  'No blocks defined',
  noBlocksDesc:     'This XDF has no XDFCHECKSUM definitions.',
  originalFile:     'Original file',
  currentState:     'Current state',
  checksumValid:    '✓ Valid',
  checksumInvalid:  (n: number) => `⚠ ${n} invalid`,
  allValid:         '✓ All checksums valid',
  fixN:             (n: number) => `Fix ${n} checksum${n !== 1 ? 's' : ''}`,
  fixing:           'Fixing…',
  stored:           'stored',
  expected:         'expected',
  checksumBadgeValid:   'Checksums valid',
  checksumBadgeInvalid: (n: number, total: number) => `${n}/${total}`,
  // Export modal
  exportInvalidTitle: (n: number) => `${n} invalid checksum${n !== 1 ? 's' : ''}`,
  exportInvalidDesc:  'Exporting with invalid checksums will likely prevent the ECU from starting.',
  fixAndExport:     'Fix checksums and export',
  exportAnyway:     'Export anyway (risky)',
  cancel:           'Cancel',
  // Topbar
  close:            'Close',
  exportBin:        'Export .bin',
  // Sidebar
  searchTables:     'Search tables…',
  noTablesFound:    'No tables found',
  tablesCount:      (n: number) => `${n} table${n !== 1 ? 's' : ''}`,
  uncategorized:    'Uncategorized',
  // Editor empty states
  selectTableTitle: 'Select a table',
  selectTableDesc:  'Choose a table from the sidebar to start editing',
  loading:          'Loading…',
  // Upload page
  uploadSubtitle:   'Load an ECU binary and its XDF definition to start editing',
  binLabel:         'ECU Binary',
  binHint:          '.bin · .ori · .mod · .hex',
  xdfLabel:         'XDF Definition',
  xdfHint:          '.xdf — TunerPro RT format',
  openInEditor:     'Open in Editor',
  localProcessing:  'Files are processed locally — nothing is uploaded to any server.',
  clickOrDrop:      'Click or drop',
  uploadError:      'Failed to load files. Check your XDF and BIN.',
  // Surface 3D
  surfaceHint:      'drag to rotate · scroll to zoom',
  // Upload tabs
  tabLibrary:       'Browse library',
  tabLocal:         'Local files',
  // Catalog browser
  catalogSearch:    'Search by car, ECU, engine…',
  catalogEmpty:     'No XDF found',
  catalogEmptyDesc: 'Try different search terms, or use a local XDF file.',
  catalogLoading:   'Loading catalog…',
  trustVerified:    'Verified',
  trustCommunity:   'Community',
  trustUnverified:  'Unverified',
  usedBy:           (n: number) => `${n} user${n !== 1 ? 's' : ''}`,
  selectThisXdf:    'Use this XDF',
  binRequired:      'Drop your .bin file here',
  backToLibrary:    '← Back',
}

export const fr: typeof en = {
  nChanges:        (n: number) => `${n} modification${n !== 1 ? 's' : ''}`,
  filterPlaceholder: 'Filtrer…',
  sortRecent:      'Récent',
  sortTable:       'Table',
  sortDelta:       'Plus grand Δ',
  row:             'ligne',
  col:             'col',
  noChangesTitle:  'Aucun changement',
  noChangesDesc:   'Modifiez des valeurs pour voir les différences ici',
  noConstantsTitle: 'Aucune constante',
  noConstantsDesc:  'Ce XDF ne définit pas de constantes',
  constantsHeading: 'Constantes',
  saveError:        (e: string) => `Erreur sauvegarde : ${e}`,
  checksumFixed:    'Checksums corrigés',
  checksumError:    (e: string) => `Erreur checksums : ${e}`,
  constantUpdated:  (name: string) => `${name} mis à jour`,
  constantError:    (e: string) => `Erreur : ${e}`,
  exported:         (name: string) => `${name} exporté`,
  exportError:      (e: string) => `Erreur export : ${e}`,
  checksumTitle:    'Checksums',
  noBlocksDefined:  'Aucun bloc défini',
  noBlocksDesc:     'Ce XDF ne contient pas de définitions XDFCHECKSUM.',
  originalFile:     'Fichier original',
  currentState:     'État actuel',
  checksumValid:    '✓ Valide',
  checksumInvalid:  (n: number) => `⚠ ${n} invalide${n !== 1 ? 's' : ''}`,
  allValid:         '✓ Tous les checksums sont valides',
  fixN:             (n: number) => `Corriger ${n} checksum${n !== 1 ? 's' : ''}`,
  fixing:           'Correction…',
  stored:           'stocké',
  expected:         'attendu',
  checksumBadgeValid:   'Checksums valides',
  checksumBadgeInvalid: (n: number, total: number) => `${n}/${total}`,
  exportInvalidTitle: (n: number) => `${n} checksum${n !== 1 ? 's' : ''} invalide${n !== 1 ? 's' : ''}`,
  exportInvalidDesc:  "Exporter avec des checksums incorrects empêchera probablement l'ECU de démarrer.",
  fixAndExport:     'Corriger les checksums puis exporter',
  exportAnyway:     'Exporter quand même (risqué)',
  cancel:           'Annuler',
  // Topbar
  close:            'Fermer',
  exportBin:        'Exporter .bin',
  // Sidebar
  searchTables:     'Rechercher…',
  noTablesFound:    'Aucune table trouvée',
  tablesCount:      (n: number) => `${n} table${n !== 1 ? 's' : ''}`,
  uncategorized:    'Non catégorisé',
  // Editor empty states
  selectTableTitle: 'Sélectionner une table',
  selectTableDesc:  'Choisissez une table dans la barre latérale pour commencer',
  loading:          'Chargement…',
  // Upload page
  uploadSubtitle:   'Chargez un binaire ECU et sa définition XDF pour commencer',
  binLabel:         'Binaire ECU',
  binHint:          '.bin · .ori · .mod · .hex',
  xdfLabel:         'Définition XDF',
  xdfHint:          '.xdf — format TunerPro RT',
  openInEditor:     'Ouvrir dans l\'éditeur',
  localProcessing:  'Fichiers traités localement — rien n\'est envoyé à un serveur.',
  clickOrDrop:      'Cliquer ou déposer',
  uploadError:      'Échec du chargement. Vérifiez votre XDF et BIN.',
  // Surface 3D
  surfaceHint:      'glisser pour pivoter · molette pour zoomer',
  // Upload tabs
  tabLibrary:       'Parcourir la bibliothèque',
  tabLocal:         'Fichier local',
  // Catalog browser
  catalogSearch:    'Rechercher par voiture, ECU, moteur…',
  catalogEmpty:     'Aucun XDF trouvé',
  catalogEmptyDesc: 'Essayez d\'autres termes, ou utilisez un fichier XDF local.',
  catalogLoading:   'Chargement du catalogue…',
  trustVerified:    'Vérifié',
  trustCommunity:   'Communauté',
  trustUnverified:  'Non vérifié',
  usedBy:           (n: number) => `${n} utilisateur${n !== 1 ? 's' : ''}`,
  selectThisXdf:    'Utiliser ce XDF',
  binRequired:      'Déposez votre fichier .bin ici',
  backToLibrary:    '← Retour',
}

// ── Context ───────────────────────────────────────────────────────────────────

type Lang = 'en' | 'fr'
const STORAGE_KEY = 'mapforge_lang'

const LangContext = createContext<{
  lang: Lang
  setLang: (l: Lang) => void
}>({ lang: 'en', setLang: () => {} })

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'fr' ? 'fr' : 'en'
  })

  const setLang = (l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l)
    setLangState(l)
  }

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}

/** Returns the translation object for the current language. */
export function useT() {
  const { lang } = useLang()
  return lang === 'fr' ? fr : en
}
