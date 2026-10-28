const fs = require('fs');
const path = require('path');

const dictsDir = path.join(__dirname, '../dicts');
const dictsTwDir = path.join(__dirname, '../dicts_tw');

// Strict Simplified-only characters that should never appear in Traditional Chinese (dicts_tw)
const STRICT_SC_CHARS_REGEX = /[们这来个时后会里为么没现让着给从还进种开实长见问间样动体机设浏账终资访对划专码并请与库发图级联议点线网链户显关选编辑删复贴换缩书签记录数调页栏项状态错确择寻检视载执将组储虚]/;

function compareDicts() {
    let hasError = false;
    
    if (!fs.existsSync(dictsDir) || !fs.existsSync(dictsTwDir)) {
        console.error('Error: dicts or dicts_tw directory does not exist.');
        process.exit(1);
    }
    
    const scFiles = fs.readdirSync(dictsDir).filter(f => f.endsWith('.json'));
    const tcFiles = fs.readdirSync(dictsTwDir).filter(f => f.endsWith('.json'));
    
    // Check if the set of files is identical
    const allFiles = Array.from(new Set([...scFiles, ...tcFiles])).sort();
    
    for (const file of allFiles) {
        const scFilePath = path.join(dictsDir, file);
        const tcFilePath = path.join(dictsTwDir, file);
        
        if (!fs.existsSync(scFilePath)) {
            console.error(`Error: File ${file} exists in dicts_tw but is missing in dicts.`);
            hasError = true;
            continue;
        }
        if (!fs.existsSync(tcFilePath)) {
            console.error(`Error: File ${file} exists in dicts but is missing in dicts_tw.`);
            hasError = true;
            continue;
        }
        
        try {
            const scData = JSON.parse(fs.readFileSync(scFilePath, 'utf8'));
            const tcData = JSON.parse(fs.readFileSync(tcFilePath, 'utf8'));
            
            const scKeys = Object.keys(scData);
            const tcKeys = Object.keys(tcData);
            
            const scKeySet = new Set(scKeys);
            const tcKeySet = new Set(tcKeys);
            
            // Check keys in SC but not in TC
            for (const key of scKeys) {
                if (!tcKeySet.has(key)) {
                    console.error(`Error in ${file}: Key "${key}" exists in dicts but is missing in dicts_tw.`);
                    hasError = true;
                }
            }
            
            // Check keys in TC but not in SC, and check for Simplified Chinese leaks in TC values
            for (const key of tcKeys) {
                if (!scKeySet.has(key)) {
                    console.error(`Error in ${file}: Key "${key}" exists in dicts_tw but is missing in dicts.`);
                    hasError = true;
                }
                const tcVal = tcData[key];
                if (typeof tcVal === 'string' && STRICT_SC_CHARS_REGEX.test(tcVal)) {
                    const m = tcVal.match(STRICT_SC_CHARS_REGEX);
                    console.error(`Error in dicts_tw/${file}: Key "${key}" contains Simplified Chinese character "${m[0]}" in value: ${tcVal}`);
                    hasError = true;
                }
            }
        } catch (e) {
            console.error(`Error parsing JSON file ${file}:`, e.message);
            hasError = true;
        }
    }
    
    if (hasError) {
        process.exit(1);
    } else {
        console.log('All dictionaries are perfectly aligned!');
        process.exit(0);
    }
}

compareDicts();
