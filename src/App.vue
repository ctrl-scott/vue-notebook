<script setup>
// LocalStorage Notebook implemented in Vue 3.
// No Meta/Facebook technologies are used.
//
// Data model
// - Multiple notebooks
// - 100 pages per notebook
// - Each page has date, time, title, content, lastModified
// - CSV and JSON export
// - JSON import
//
// Notes:
// - White background and black text are applied.
// - No contractions are used in comments.
//

import { reactive, ref, computed, watch } from 'vue'

const STORAGE_KEY = 'ls_notebooks_v1'
const MAX_PAGES = 100

function freshPage(){
  return { date: '', time: '', title: '', content: '', lastModified: null }
}

function makeNotebook(name){
  return { id: crypto.randomUUID(), name: name || 'Untitled', pages: Array.from({length: MAX_PAGES}, freshPage) }
}

function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if(!raw){
      const nb = makeNotebook('My First Notebook')
      const initial = { notebooks: [nb], selectedId: nb.id }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
      return initial
    }
    const parsed = JSON.parse(raw)
    if(!parsed.notebooks || !Array.isArray(parsed.notebooks)) throw new Error('invalid')
    return parsed
  } catch(e){
    const nb = makeNotebook('Recovered Notebook')
    const fallback = { notebooks: [nb], selectedId: nb.id }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

const state = reactive(load())

const selectedId = computed({
  get(){ return state.selectedId || (state.notebooks[0] && state.notebooks[0].id) || null },
  set(v){ state.selectedId = v }
})

const notebooks = computed(() => state.notebooks)

const currentNotebook = computed(() => {
  return state.notebooks.find(n => n.id === selectedId.value) || state.notebooks[0]
})

// UI state
const pageNumber = ref(1)
const dateInput = ref('')
const timeInput = ref('')
const titleInput = ref('')
const contentInput = ref('')
const status = ref('')
const statusClass = ref('muted')
const storageInfo = ref('…')
const charCount = ref(0)
const newNotebookName = ref('')
const importInput = ref(null)

function clampPage(v){
  if(isNaN(v)) return 1
  return Math.max(1, Math.min(MAX_PAGES, v))
}

function currentPageIndex(){
  return clampPage(Number(pageNumber.value)) - 1
}

// Persistence
function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  updateStorageInfo()
}

function setStatus(msg, cls='muted'){
  status.value = msg
  statusClass.value = cls
}

function populateFormFromPage(){
  const nb = currentNotebook.value
  if(!nb) return
  const p = nb.pages[currentPageIndex()] || freshPage()
  dateInput.value = p.date || ''
  timeInput.value = p.time || ''
  titleInput.value = p.title || ''
  contentInput.value = p.content || ''
  updateCharCount()
}

function updateStorageInfo(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || ''
    const kb = (new Blob([raw]).size / 1024).toFixed(1)
    storageInfo.value = kb + ' KB used'
  } catch {
    storageInfo.value = 'n/a'
  }
}

const pageMeta = computed(() => {
  const nb = currentNotebook.value
  if(!nb) return ''
  const p = nb.pages[currentPageIndex()] || freshPage()
  const meta = p.lastModified ? new Date(p.lastModified).toLocaleString() : 'never saved'
  return `Notebook: ${nb.name} · Page ${currentPageIndex()+1}/${MAX_PAGES} · Last saved: ${meta}`
})

function updateCharCount(){
  charCount.value = (titleInput.value?.length || 0) + (contentInput.value?.length || 0)
}

function savePage(){
  const nb = currentNotebook.value
  if(!nb) return
  const idx = currentPageIndex()
  const page = nb.pages[idx]
  page.date = dateInput.value || ''
  page.time = timeInput.value || ''
  page.title = (titleInput.value || '').trim()
  page.content = contentInput.value || ''
  page.lastModified = Date.now()
  persist()
  populateFormFromPage()
  setStatus('Page saved.', 'success')
}

function clearPage(){
  if(!confirm('Clear this page? This action cannot be undone.')) return
  const nb = currentNotebook.value
  if(!nb) return
  nb.pages[currentPageIndex()] = freshPage()
  persist()
  populateFormFromPage()
  setStatus('Page cleared.', 'warn')
}

function eraseNotebook(){
  if(!confirm('Erase ALL 100 pages in this notebook? This action cannot be undone.')) return
  const nb = currentNotebook.value
  if(!nb) return
  nb.pages = Array.from({length: MAX_PAGES}, freshPage)
  persist()
  populateFormFromPage()
  setStatus('Notebook erased.', 'warn')
}

function createNotebook(){
  const name = (newNotebookName.value || '').trim()
  if(!name){ setStatus('Please enter a notebook name.', 'warn'); return }
  const nb = makeNotebook(name)
  state.notebooks.push(nb)
  selectedId.value = nb.id
  newNotebookName.value = ''
  persist()
  populateFormFromPage()
  setStatus('Notebook created.', 'success')
}

// Export / Import
function csvEscape(v){
  const s = String(v ?? '')
  if(/[",\n]/.test(s)) return '"' + s.replaceAll('"', '""') + '"'
  return s
}

function exportCsv(){
  const nb = currentNotebook.value
  if(!nb) return
  const header = ['notebook','page','date','time','title','content']
  const rows = [header.join(',')]
  nb.pages.forEach((p, i) => {
    const row = [nb.name, i+1, p.date, p.time, p.title, p.content].map(csvEscape).join(',')
    rows.push(row)
  })
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${nb.name.replaceAll(/[^\w\-]+/g,'_')}_notebook.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  setStatus('CSV exported.', 'success')
}

function exportJson(){
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'notebooks_export.json'
  a.click()
  URL.revokeObjectURL(a.href)
  setStatus('JSON exported.', 'success')
}

function handleImportJson(ev){
  const file = ev.target.files && ev.target.files[0]
  if(!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      if(!data || !Array.isArray(data.notebooks)) throw new Error('Invalid format')
      // Mutate reactive object to preserve reactivity
      state.notebooks.splice(0, state.notebooks.length, ...data.notebooks)
      state.selectedId = data.selectedId
      persist()
      populateFormFromPage()
      setStatus('JSON imported successfully.', 'success')
    } catch(e){
      setStatus('Import failed: ' + e.message, 'warn')
    } finally {
      if(importInput.value) importInput.value.value = ''
    }
  }
  reader.readAsText(file)
}

// Navigation
function prevPage(){
  const idx = currentPageIndex()
  pageNumber.value = String(Math.max(1, idx))
  populateFormFromPage()
}

function nextPage(){
  const idx = currentPageIndex()
  pageNumber.value = String(Math.min(MAX_PAGES, idx + 2))
  populateFormFromPage()
}

// Effects
watch(selectedId, () => {
  persist()
  pageNumber.value = 1
  populateFormFromPage()
})

watch([titleInput, contentInput], updateCharCount)

function init(){
  // Hydrate UI from current page
  populateFormFromPage()
  updateStorageInfo()
}

init()
</script>

<template>
  <div class="app" role="application" aria-label="LocalStorage Notebook (Vue)">
    <header>
      <h1>Notebook (100 pages each) — Vue</h1>
      <div class="toolbar">
        <fieldset>
          <legend>Notebook</legend>
          <div class="row">
            <div class="col-6">
              <label for="notebookSelect">Choose notebook</label>
              <select id="notebookSelect" v-model="state.selectedId" aria-label="Notebook selector">
                <option v-for="nb in notebooks" :key="nb.id" :value="nb.id">{{ nb.name }}</option>
              </select>
            </div>
            <div class="col-6">
              <label for="newNotebookName">Create new notebook</label>
              <div class="controls">
                <input id="newNotebookName" type="text" placeholder="Name (e.g., Journal Q3)" v-model="newNotebookName" />
                <button class="primary" title="Create notebook" @click="createNotebook">Create</button>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Export / Import</legend>
          <div class="controls">
            <button title="Export selected notebook as CSV" @click="exportCsv">Export CSV</button>
            <button title="Export all notebooks as JSON" @click="exportJson">Export JSON</button>
            <label class="muted" style="align-self:center" for="importJsonInput">Import JSON</label>
            <input id="importJsonInput" ref="importInput" type="file" accept="application/json" @change="handleImportJson" />
          </div>
        </fieldset>
      </div>
    </header>

    <fieldset>
      <legend>Page</legend>
      <div class="row">
        <div class="col-4">
          <label for="pageNumber">Page number (1–100)</label>
          <div class="controls">
            <input id="pageNumber" type="number" min="1" max="100" v-model="pageNumber" @change="pageNumber = String(clampPage(Number(pageNumber))) ; populateFormFromPage()" />
            <button title="Previous page" aria-label="Previous page" @click="prevPage">◀</button>
            <button title="Next page" aria-label="Next page" @click="nextPage">▶</button>
          </div>
          <div class="muted">{{ pageMeta }}</div>
        </div>
        <div class="col-4">
          <label for="dateInput">Date</label>
          <input id="dateInput" type="date" v-model="dateInput" />
        </div>
        <div class="col-4">
          <label for="timeInput">Time</label>
          <input id="timeInput" type="time" v-model="timeInput" />
        </div>
        <div class="col-12">
          <label for="titleInput">Title</label>
          <input id="titleInput" type="text" placeholder="Short title" maxlength="200" v-model="titleInput" />
        </div>
        <div class="col-12">
          <label for="contentInput">Content</label>
          <textarea id="contentInput" placeholder="Write your content here…" v-model="contentInput"></textarea>
          <div class="muted">{{ charCount }} characters (title + content)</div>
        </div>
      </div>

      <div class="controls">
        <button class="primary" @click="savePage">Save page</button>
        <button title="Clear this page only" @click="clearPage">Clear page</button>
        <button title="Erase all 100 pages in this notebook" @click="eraseNotebook">Erase notebook</button>
      </div>
      <div class="status" :class="statusClass" role="status" aria-live="polite">{{ status }}</div>
    </fieldset>

    <div class="footer">
      <div>Storage: <span class="chip">{{ storageInfo }}</span></div>
      <div>Tips: Use <span class="kbd">Tab</span> to move between fields. Changes are saved only when you click <em>Save page</em>.</div>
    </div>
  </div>
</template>

<style>
:root { --maxw: 980px; }
html, body { background: #fff; color: #000; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
body { margin: 0; padding: 1.25rem; display: grid; place-items: start center; }
.app { width: min(100%, var(--maxw)); display: grid; gap: 1rem; }
header { display: grid; gap: .5rem; }
header h1 { margin: 0; font-size: 1.4rem; letter-spacing: .3px; }

.toolbar { display: grid; grid-template-columns: 1fr auto; gap: .75rem; align-items: end; }
.row { display: grid; grid-template-columns: repeat(12, 1fr); gap: .75rem; }
.col-3 { grid-column: span 3; }
.col-4 { grid-column: span 4; }
.col-5 { grid-column: span 5; }
.col-6 { grid-column: span 6; }
.col-7 { grid-column: span 7; }
.col-8 { grid-column: span 8; }
.col-9 { grid-column: span 9; }
.col-12 { grid-column: span 12; }

fieldset { border: 1px solid #222; border-radius: .75rem; padding: .75rem; }
legend { padding: 0 .35rem; font-weight: 600; }

label { display: block; font-size: .9rem; margin-bottom: .25rem; }
input[type="text"], input[type="date"], input[type="time"], textarea, select, input[type="number"] {
  width: 100%; box-sizing: border-box; padding: .6rem .7rem; border: 1px solid #333; border-radius: .6rem;
  background: #fff; color: #000; font-size: 1rem;
}
textarea { min-height: 220px; resize: vertical; line-height: 1.4; }

.controls { display: flex; flex-wrap: wrap; gap: .5rem; }
button {
  border: 1px solid #111; background: #f6f6f6; color: #000; padding: .55rem .8rem; border-radius: .6rem; cursor: pointer; 
}
button:hover { filter: brightness(.96); }
button.primary { background: #eaeaea; font-weight: 600; }

.muted { color: #333; font-size: .9rem; }
.warn { color: #7a1f00; }
.success { color: #0a6e00; }
.status { min-height: 1.2rem; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.stack { display: grid; gap: .5rem; }

.footer { font-size: .85rem; color: #333; display: flex; justify-content: space-between; flex-wrap: wrap; gap: .5rem; }
.chip { border: 1px solid #222; border-radius: 999px; padding: .1rem .5rem; }
.kbd { border: 1px solid #222; border-radius: .4rem; padding: .05rem .35rem; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

@media (max-width: 760px){
  .row { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
  .toolbar { grid-template-columns: 1fr; }
}
</style>
