const fs = require('fs');
const QRCode = require('qrcode');

const URL_TO_ENCODE = 'https://rakeshgowdar.github.io/pookolam.github.io/';

QRCode.toString(URL_TO_ENCODE, { type: 'svg', margin: 1, color: { dark: '#2a1a0a', light: '#ffffff' } }, (err, svg) => {
  if (err) throw err;
  fs.writeFileSync(__dirname + '/assets/qr.svg', svg);
  console.log('Wrote assets/qr.svg for', URL_TO_ENCODE);
});
