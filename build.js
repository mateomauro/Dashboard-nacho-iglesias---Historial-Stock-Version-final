const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');

// Crear carpeta dist si no existe
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

// Archivos a copiar
const files = ['index.html', 'styles.css', 'app.js'];

files.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(distDir, file);
    fs.copyFileSync(src, dest);
    console.log(`✓ Copiado: ${file}`);
});

console.log('\n✅ Build completado. Archivos listos en /dist');
