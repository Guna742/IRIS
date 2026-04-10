const http = require('http');
const fs = require('fs');
const path = require('path');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((request, response) => {
    // Strip query strings from the path
    let urlPath = request.url.split('?')[0];
    let filePath = '.' + urlPath;
    
    if (filePath == './') {
        filePath = './login.html';
    }

    // Support extensionless URLs for HTML files
    if (path.extname(filePath) === '' && !filePath.endsWith('/')) {
        const potentialHtml = filePath + '.html';
        if (fs.existsSync(potentialHtml)) {
            filePath = potentialHtml;
        }
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, function(error, content) {
        if (error) {
            if(error.code == 'ENOENT') {
                response.writeHead(404);
                response.end('404', 'utf-8');
            } else {
                response.writeHead(500);
                response.end('error: '+error.code);
            }
        } else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content, 'utf-8');
        }
    });
});

server.listen(8081);
console.log('Server running at http://localhost:8081/');
