import { openDB } from 'idb'

const DB = openDB('kinloei', 1, {
  upgrade(db) {
    db.createObjectStore('profile')
    const scans = db.createObjectStore('scans', { keyPath: 'localId', autoIncrement: true })
    scans.createIndex('savedAt', 'savedAt')
  },
})

export const getProfile = async () => (await (await DB).get('profile', 'health')) ?? {}

export const saveProfile = async (profile) => (await DB).put('profile', profile, 'health')

export const saveScan = async (result) => {
  const record = { ...result, savedAt: Date.now() }
  await (await DB).add('scans', record)
}

export const getScans = async (limit = 50) => {
  const all = await (await DB).getAll('scans')
  return all.sort((a, b) => b.savedAt - a.savedAt).slice(0, limit)
}

export const clearAllData = async () => {
  const db = await DB
  await db.clear('profile')
  await db.clear('scans')
}

export const getDeviceId = () => {
  let id = localStorage.getItem('kinloei_device_id')
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('kinloei_device_id', id)
  }
  return id
}
