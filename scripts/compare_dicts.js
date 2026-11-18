const fs = require('fs');
const path = require('path');

const dictsDir = path.join(__dirname, '../dicts');
const dictsTwDir = path.join(__dirname, '../dicts_tw');

// Strict Simplified-only characters that should never appear in Traditional Chinese (dicts_tw)
const STRICT_SC_CHARS_REGEX = /[们这来个时后会里为么没现让着给从还进种开实长见问间样动体机设浏账终资访对划专码并请与库发图级联议点线网链户显关选编辑删复贴换缩书签记录数调页栏项状态错确择寻检视载执将组储虚词阅围离频计认产单条仓价协约织缝触凭诊无据]/;

// Forbidden mainland / non-standard terminology & HK variants in Traditional Chinese (dicts_tw) per AGENTS.md
const FORBIDDEN_TC_TERMS = [
    '智能體', '代碼', '文檔', '賬號', '賬戶', '帳號', '應用程序', '自定義', '默認', '剪貼板',
    '設置', '窗口', '插件', '快捷鍵', '控制台', '拆分', '檔案資源管理器', '訪達',
    '全局', '腳本', '日誌', '打開', '開啓', '添加', '刷新', '本地', '遠程', '會話', '標籤頁',
    '啓', '爲', '錄制', '複制', '訂制', '髮送'
];

function normalizeText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ')
               .trim()
               .replace(/[‘’]/g, "'")
               .replace(/[“”]/g, '"')
               .replace(/…/g, '...');
}

function compareDicts() {
    let hasError = false;
    
    if (!fs.existsSync(dictsDir) || !fs.existsSync(dictsTwDir)) {
        console.error('Error: dicts or dicts_tw directory does not exist.');
        return false;
    }
    
    const scFiles = fs.readdirSync(dictsDir).filter(f => f.endsWith('.json'));
    const tcFiles = fs.readdirSync(dictsTwDir).filter(f => f.endsWith('.json'));
    
    // Check if the set of files is identical
    const allFiles = Array.from(new Set([...scFiles, ...tcFiles])).sort();
    const seenAcrossFiles = new Map();
    const seenNormalizedAcrossFiles = new Map();
    
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
            
            // Check keys in SC but not in TC, empty SC values, and cross-file duplicate keys
            for (const key of scKeys) {
                if (!tcKeySet.has(key)) {
                    console.error(`Error in ${file}: Key "${key}" exists in dicts but is missing in dicts_tw.`);
                    hasError = true;
                }
                const scVal = scData[key];
                if (typeof scVal !== 'string' || scVal.trim() === '') {
                    console.error(`Error in dicts/${file}: Key "${key}" has empty or non-string value.`);
                    hasError = true;
                }
                if (seenAcrossFiles.has(key)) {
                    console.error(`Error: Duplicate key "${key}" found in both ${seenAcrossFiles.get(key)} and ${file}.`);
                    hasError = true;
                } else {
                    seenAcrossFiles.set(key, file);
                }
                const normKey = normalizeText(key);
                if (normKey) {
                    if (seenNormalizedAcrossFiles.has(normKey) && seenNormalizedAcrossFiles.get(normKey).raw !== key) {
                        const prev = seenNormalizedAcrossFiles.get(normKey);
                        console.error(`Error: Normalized key collision "${normKey}" between ${prev.file} ("${prev.raw}") and ${file} ("${key}").`);
                        hasError = true;
                    } else if (!seenNormalizedAcrossFiles.has(normKey)) {
                        seenNormalizedAcrossFiles.set(normKey, { file, raw: key });
                    }
                }
            }
            
            // Check keys in TC but not in SC, empty TC values, and Simplified/forbidden leaks
            for (const key of tcKeys) {
                if (!scKeySet.has(key)) {
                    console.error(`Error in ${file}: Key "${key}" exists in dicts_tw but is missing in dicts.`);
                    hasError = true;
                }
                const tcVal = tcData[key];
                if (typeof tcVal !== 'string' || tcVal.trim() === '') {
                    console.error(`Error in dicts_tw/${file}: Key "${key}" has empty or non-string value.`);
                    hasError = true;
                } else {
                    if (STRICT_SC_CHARS_REGEX.test(tcVal)) {
                        const m = tcVal.match(STRICT_SC_CHARS_REGEX);
                        console.error(`Error in dicts_tw/${file}: Key "${key}" contains Simplified Chinese character "${m[0]}" in value: ${tcVal}`);
                        hasError = true;
                    }
                    for (const term of FORBIDDEN_TC_TERMS) {
                        if (tcVal.includes(term)) {
                            console.error(`Error in dicts_tw/${file}: Key "${key}" contains forbidden term "${term}" in value: ${tcVal}`);
                            hasError = true;
                        }
                    }
                    if (/終端(?!機)/.test(tcVal)) {
                        console.error(`Error in dicts_tw/${file}: Key "${key}" contains forbidden term "終端" (should be "終端機") in value: ${tcVal}`);
                        hasError = true;
                    }
                }
            }
        } catch (e) {
            console.error(`Error parsing JSON file ${file}:`, e.message);
            hasError = true;
        }
    }
    
    if (!hasError) {
        console.log('All dictionaries are perfectly aligned!');
    }
    return !hasError;
}

if (require.main === module) {
    process.exit(compareDicts() ? 0 : 1);
}

module.exports = {
    compareDicts,
    normalizeText,
    STRICT_SC_CHARS_REGEX,
    FORBIDDEN_TC_TERMS
};
