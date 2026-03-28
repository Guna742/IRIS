const fs = require('fs');
const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
let missing = [];
htmlFiles.forEach(html => {
    const content = fs.readFileSync(html, 'utf8');
    const regexp = /src=\"js\/([^\"]+)\"/g;
    let m;
    while ((m = regexp.exec(content)) !== null) {
        let script = 'js/' + m[1];
        if (!fs.existsSync(script)) {
            missing.push({ html, script });
        }
    }
});
fs.writeFileSync('missing_scripts_result.json', JSON.stringify(missing, null, 2));
console.log('Done reporting', htmlFiles.length, 'files');
