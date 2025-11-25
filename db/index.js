const fileDB = require('./file');
const recordUtils = require('./record');
const vaultEvents = require('../events');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB Connection
const recordSchema = new mongoose.Schema({
  id: Number,
  name: String,
  value: String,
  createdAt: Date,
  updatedAt: Date
});

const Record = mongoose.model('Record', recordSchema);

async function connectMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nodevault');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.log('📁 Using file system storage (MongoDB not available)');
  }
}

connectMongoDB();

// Auto Backup Function
function createBackup(data) {
  const backupsDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupsDir, `backup_${timestamp}.json`);
  
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`✅ Backup created: ${path.basename(backupFile)}`);
}

// Main Functions
function addRecord({ name, value }) {
  recordUtils.validateRecord({ name, value });
  const data = fileDB.readDB();
  const newRecord = { 
    id: recordUtils.generateId(), 
    name, 
    value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.push(newRecord);
  fileDB.writeDB(data);
  vaultEvents.emit('recordAdded', newRecord);
  createBackup(data);
  
  // Also save to MongoDB if connected
  if (mongoose.connection.readyState === 1) {
    const mongoRecord = new Record(newRecord);
    mongoRecord.save();
  }
  
  return newRecord;
}

function listRecords() {
  return fileDB.readDB();
}

function updateRecord(id, newName, newValue) {
  const data = fileDB.readDB();
  const record = data.find(r => r.id === id);
  if (!record) return null;
  record.name = newName;
  record.value = newValue;
  record.updatedAt = new Date().toISOString();
  fileDB.writeDB(data);
  vaultEvents.emit('recordUpdated', record);
  createBackup(data);
  return record;
}

function deleteRecord(id) {
  let data = fileDB.readDB();
  const record = data.find(r => r.id === id);
  if (!record) return null;
  data = data.filter(r => r.id !== id);
  fileDB.writeDB(data);
  vaultEvents.emit('recordDeleted', record);
  createBackup(data);
  return record;
}

// Search Functionality
function searchRecords(keyword) {
  const data = fileDB.readDB();
  const searchTerm = keyword.toLowerCase();
  const matches = data.filter(record => 
    record.name.toLowerCase().includes(searchTerm) || 
    record.id.toString().includes(searchTerm)
  );
  
  if (matches.length === 0) {
    console.log('No records found.');
  } else {
    console.log(`Found ${matches.length} matching records:`);
    matches.forEach((record, index) => {
      console.log(`${index + 1}. ID: ${record.id} | Name: ${record.name} | Value: ${record.value} | Created: ${new Date(record.createdAt).toISOString().split('T')[0]}`);
    });
  }
  return matches;
}

// Sorting Capability
function sortRecords(field, order) {
  const data = fileDB.readDB();
  let sortedData = [...data];
  
  if (field.toLowerCase() === 'name') {
    sortedData.sort((a, b) => a.name.localeCompare(b.name));
  } else if (field.toLowerCase() === 'date') {
    sortedData.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  
  if (order.toLowerCase() === 'desc') {
    sortedData.reverse();
  }
  
  console.log('Sorted Records:');
  sortedData.forEach((record, index) => {
    console.log(`${index + 1}. ID: ${record.id} | Name: ${record.name} | Created: ${new Date(record.createdAt).toISOString().split('T')[0]}`);
  });
  
  return sortedData;
}

// Export to Text File
function exportData() {
  const data = fileDB.readDB();
  const timestamp = new Date().toLocaleString();
  const exportContent = `
NodeVault Data Export
====================
Export Date: ${timestamp}
Total Records: ${data.length}
File: export.txt

Records:
${data.map((record, index) => 
  `${index + 1}. ID: ${record.id} | Name: ${record.name} | Value: ${record.value} | Created: ${new Date(record.createdAt).toISOString().split('T')[0]}`
).join('\n')}
  `.trim();
  
  fs.writeFileSync('export.txt', exportContent);
  console.log('✅ Data exported successfully to export.txt');
}

// Data Statistics
function showStatistics() {
  const data = fileDB.readDB();
  
  if (data.length === 0) {
    console.log('No records available for statistics.');
    return;
  }
  
  const longestNameRecord = data.reduce((longest, current) => 
    current.name.length > longest.name.length ? current : longest
  , data[0]);
  
  const sortedByDate = [...data].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const earliest = sortedByDate[0];
  const latest = sortedByDate[sortedByDate.length - 1];
  
  const lastModified = data.reduce((latest, current) => 
    new Date(current.updatedAt) > new Date(latest.updatedAt) ? current : latest
  , data[0]);
  
  console.log(`
Vault Statistics:
--------------------------
Total Records: ${data.length}
Last Modified: ${new Date(lastModified.updatedAt).toLocaleString()}
Longest Name: ${longestNameRecord.name} (${longestNameRecord.name.length} characters)
Earliest Record: ${new Date(earliest.createdAt).toISOString().split('T')[0]}
Latest Record: ${new Date(latest.createdAt).toISOString().split('T')[0]}
  `.trim());
}

module.exports = { 
  addRecord, 
  listRecords, 
  updateRecord, 
  deleteRecord, 
  searchRecords, 
  sortRecords, 
  exportData, 
  showStatistics 
};
