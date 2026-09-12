import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import Busboy from 'busboy'
import { PDFParse } from 'pdf-parse'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dataPath = join(root, 'server', 'data.json')
const uploadsPath = join(root, 'server', 'uploads')
const port = Number(process.env.API_PORT || 4174)
const sessions = new Map()

const seed = {
  users: [
    { id: 1, name: 'Amina Rahman', username: 'amina', password: 'password123', email: 'amina@vub.ac.be', university: 'VUB', department: 'Computer Science', role: 'Publisher' },
    { id: 2, name: 'Omar Haddad', username: 'omar', password: 'password123', email: 'omar@vub.ac.be', university: 'VUB', department: 'Computer Science', role: 'Moderator' },
    { id: 3, name: 'Nora Janssens', username: 'nora', password: 'password123', email: 'nora@vub.ac.be', university: 'VUB', department: 'Linguistics', role: 'Member' },
    { id: 4, name: 'System Administrator', username: 'admin', password: 'password123', email: 'admin@vub.ac.be', university: 'VUB', department: 'Research Office', role: 'Administrator' },
  ],
  publications: [
    { id: 1, title: 'Trustworthy Search in Digital Libraries', author: 'Amina Rahman', department: 'Computer Science', year: 2024, abstract: 'A practical study of transparent ranking, query interpretation and user trust in academic search systems.', owner: 'amina', references: ['Boolean retrieval revisited', 'Human-centred information access'], format: 'PDF' },
    { id: 2, title: 'Language, Metadata and Scholarly Identity', author: 'Nora Janssens', department: 'Linguistics', year: 2022, abstract: 'How normalized author and institution metadata improves discovery across publication repositories.', owner: 'nora', references: ['Names in digital archives'], format: 'PDF' },
    { id: 3, title: 'Departmental Knowledge Graphs', author: 'Amina Rahman', department: 'Computer Science', year: 2021, abstract: 'A model for connecting publications, references and research groups without losing provenance.', owner: 'amina', references: ['Trustworthy Search in Digital Libraries'], format: 'PS' },
  ],
  groups: [
    { id: 1, name: 'Software Engineering Group', department: 'Computer Science', members: 2 },
    { id: 2, name: 'Digital Humanities Lab', department: 'Linguistics', members: 1 },
  ],
}

function load() {
  if (!existsSync(dataPath)) writeFileSync(dataPath, JSON.stringify(seed, null, 2))
  const db = JSON.parse(readFileSync(dataPath, 'utf8'))
  let migrated = false
  for (const user of db.users) {
    if (user.password && !user.password.startsWith('scrypt$')) {
      user.password = hashPassword(user.password)
      migrated = true
    }
  }
  if (migrated) save(db)
  return db
}
function save(db) { writeFileSync(dataPath, JSON.stringify(db, null, 2)) }
function hashPassword(password) { const salt = randomBytes(16).toString('hex'); const hash = scryptSync(password, salt, 64).toString('hex'); return `scrypt$${salt}$${hash}` }
function verifyPassword(password, stored) { if (!stored?.startsWith('scrypt$')) return stored === password; const [, salt, expected] = stored.split('$'); const actual = scryptSync(password, salt, 64); return timingSafeEqual(actual, Buffer.from(expected, 'hex')) }
function publicUser(user) { const safe = { ...user }; delete safe.password; return safe }
function body(request) { return new Promise((resolve, reject) => { let value = ''; request.on('data', (chunk) => { value += chunk }); request.on('end', () => { try { resolve(value ? JSON.parse(value) : {}) } catch { reject(new Error('Invalid JSON')) } }) }) }
function multipart(request) { return new Promise((resolve, reject) => { const parser = Busboy({ headers: request.headers, limits: { files: 1, fileSize: 25 * 1024 * 1024 } }); const fields = {}; let file; parser.on('field', (name, value) => { fields[name] = value }); parser.on('file', (name, stream, info) => { const chunks = []; stream.on('data', (chunk) => chunks.push(chunk)); stream.on('limit', () => reject(new Error('File is larger than 25 MB.'))); stream.on('end', () => { file = { field: name, filename: info.filename, mimeType: info.mimeType, data: Buffer.concat(chunks) } }) }); parser.on('finish', () => resolve({ fields, file })); parser.on('error', reject); request.pipe(parser) }) }
async function extractText(file) { if (file.mimeType === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf')) { const parser = new PDFParse({ data: file.data }); try { return (await parser.getText()).text.trim() } finally { await parser.destroy() } } return file.data.toString('utf8').trim() }
function send(response, status, payload) { response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-session' }); response.end(JSON.stringify(payload)) }
function fail(response, status, message) { send(response, status, { error: message }) }
function sessionUser(request, db) { const token = request.headers['x-session']; const username = sessions.get(token); return db.users.find((user) => user.username === username) }
function allowed(user, condition) { return user && condition }

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,x-session' }); return response.end() }
  const url = new URL(request.url, `http://${request.headers.host}`)
  const db = load()
  try {
    if (request.method === 'GET' && url.pathname === '/api/bootstrap') { const current = sessionUser(request, db); return send(response, 200, { users: current ? db.users.map(publicUser) : [], publications: db.publications, groups: db.groups }) }
    if (request.method === 'GET' && url.pathname === '/api/network') return send(response, 200, { recognized: request.socket.remoteAddress === '127.0.0.1' || request.socket.remoteAddress === '::1' })
    if (request.method === 'POST' && url.pathname === '/api/login') {
      const input = await body(request); const user = db.users.find((item) => item.username === String(input.username).trim().toLowerCase())
      if (!user || !verifyPassword(String(input.password), user.password)) return fail(response, 401, 'Invalid username or password.')
      const token = randomUUID(); sessions.set(token, user.username); return send(response, 200, { user: publicUser(user), token })
    }
    if (request.method === 'POST' && url.pathname === '/api/register') {
      const input = await body(request); const username = String(input.username).trim().toLowerCase()
      if (!username || String(input.password).length < 8 || db.users.some((item) => item.username === username)) return fail(response, 400, 'Username already exists or registration data is invalid.')
      const user = { id: Date.now(), name: String(input.name), username, password: hashPassword(String(input.password)), email: String(input.email), university: String(input.university), department: String(input.department), role: 'Member' }
      db.users.push(user); save(db); return send(response, 201, { user: publicUser(user) })
    }
    const current = sessionUser(request, db)
    if (!current) return fail(response, 401, 'Authentication required.')
    if (request.method === 'POST' && url.pathname === '/api/publications') {
      if (!allowed(current, ['Publisher', 'Moderator', 'Administrator'].includes(current.role))) return fail(response, 403, 'Only Publishers and above may upload publications.')
      if (!request.headers['content-type']?.includes('multipart/form-data')) return fail(response, 400, 'Upload a PDF or PS file.')
      const input = await multipart(request); if (!input.file || !/\.(pdf|ps)$/i.test(input.file.filename)) return fail(response, 400, 'Only PDF and PS files are supported.')
      const extractedText = await extractText(input.file); if (!extractedText) return fail(response, 400, 'No readable text could be extracted from this document.')
      await mkdir(uploadsPath, { recursive: true }); const storedName = `${Date.now()}-${input.file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`; await writeFile(join(uploadsPath, storedName), input.file.data)
      const publication = { id: Date.now(), title: String(input.fields.title || input.file.filename.replace(/\.(pdf|ps)$/i, '')), author: current.name, department: current.department, year: Number(input.fields.year || new Date().getFullYear()), abstract: extractedText.slice(0, 500), extractedText, fileName: input.file.filename, storedFile: storedName, owner: current.username, references: [], format: input.file.filename.split('.').pop().toUpperCase() }
      db.publications.unshift(publication); save(db); return send(response, 201, { publication })
    }
    if (request.method === 'POST' && url.pathname === '/api/users') {
      if (current.role !== 'Administrator') return fail(response, 403, 'Only Administrators may create users.')
      const input = await body(request); const username = String(input.username).trim().toLowerCase()
      if (!username || String(input.password).length < 8 || db.users.some((item) => item.username === username)) return fail(response, 400, 'Username already exists or registration data is invalid.')
      const created = { id: Date.now(), name: String(input.name), username, password: hashPassword(String(input.password)), email: String(input.email), university: String(input.university), department: String(input.department), role: input.role || 'Member' }
      db.users.push(created); save(db); return send(response, 201, { user: publicUser(created) })
    }
    if (request.method === 'PATCH' && url.pathname.startsWith('/api/users/') && !url.pathname.endsWith('/role')) {
      if (current.role !== 'Administrator' && current.role !== 'Moderator') return fail(response, 403, 'Administration access required.')
      const target = db.users.find((item) => item.id === Number(url.pathname.split('/').pop())); if (!target || (current.role === 'Moderator' && target.department !== current.department)) return fail(response, 403, 'You cannot edit this user.')
      const input = await body(request); Object.assign(target, { name: input.name ?? target.name, email: input.email ?? target.email, university: input.university ?? target.university, department: current.role === 'Administrator' ? (input.department ?? target.department) : target.department }); save(db); return send(response, 200, { user: publicUser(target) })
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/users/')) {
      if (current.role !== 'Administrator') return fail(response, 403, 'Only Administrators may delete users.')
      const id = Number(url.pathname.split('/').pop()); const target = db.users.find((item) => item.id === id); if (!target || target.username === current.username) return fail(response, 403, 'You cannot delete this user.')
      db.users = db.users.filter((item) => item.id !== id); save(db); return send(response, 200, { ok: true })
    }
    if (request.method === 'POST' && url.pathname.startsWith('/api/users/') && url.pathname.endsWith('/role')) {
      if (current.role !== 'Administrator' && current.role !== 'Moderator') return fail(response, 403, 'Administration access required.')
      const id = Number(url.pathname.split('/')[3]); const target = db.users.find((item) => item.id === id); const input = await body(request)
      if (!target || !['Member', 'Publisher', 'Moderator', 'Administrator'].includes(input.role)) return fail(response, 400, 'Invalid user or role.')
      if (current.role === 'Moderator' && (target.department !== current.department || !['Member', 'Publisher'].includes(input.role))) return fail(response, 403, 'Moderators can only manage Member and Publisher roles in their department.')
      if (target.username === current.username) return fail(response, 403, 'You cannot change your own role.')
      target.role = input.role; save(db); return send(response, 200, { user: publicUser(target) })
    }
    if (request.method === 'POST' && url.pathname === '/api/groups') {
      if (current.role !== 'Administrator' && current.role !== 'Moderator') return fail(response, 403, 'Administration access required.')
      const input = await body(request); const group = { id: Date.now(), name: String(input.name).trim(), department: current.role === 'Moderator' ? current.department : String(input.department || current.department), members: 0 }
      if (!group.name) return fail(response, 400, 'Group name is required.')
      db.groups.push(group); save(db); return send(response, 201, { group })
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/groups/')) {
      if (current.role !== 'Administrator' && current.role !== 'Moderator') return fail(response, 403, 'Administration access required.')
      const id = Number(url.pathname.split('/').pop()); const group = db.groups.find((item) => item.id === id)
      if (!group || (current.role === 'Moderator' && group.department !== current.department)) return fail(response, 403, 'You cannot manage this group.')
      if (group.members > 0) return fail(response, 400, 'Group cannot be deleted while it contains users.')
      db.groups = db.groups.filter((item) => item.id !== id); save(db); return send(response, 200, { ok: true })
    }
    return fail(response, 404, 'Route not found.')
  } catch (error) { return fail(response, 500, error.message) }
})
server.on('error', (error) => { if (error.code === 'EADDRINUSE') { console.error(`PMS API is already running on port ${port}. Reuse it or stop the existing process.`); process.exitCode = 0; return } console.error(error); process.exitCode = 1 })
server.listen(port, () => console.log(`PMS API listening on http://localhost:${port}`))
