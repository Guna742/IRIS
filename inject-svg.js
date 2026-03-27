const fs = require('fs');
const path = require('path');

const svgMarkup = `<img src="img/site-logo.png" alt="I.R.I.S" style="width: 100%; height: 100%; object-fit: contain; padding: 6px;">`;

const htmlFiles = [
    'projects.html',
    'profile-view.html',
    'profile-builder.html',
    'leaderboard.html',
    'students.html',
    'student-profile.html',
    'student-analytics.html',
    'admin-profile.html',
    'dashboard.html',
    'login.html'
];

htmlFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        // Replace <img> tag entirely. Matches any img pointing to iris-logo.png
        content = content.replace(/<img\s+src="img\/site-logo\.png"[^>]*>/g, svgMarkup);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    }
});
