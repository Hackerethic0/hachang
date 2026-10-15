// ตั้งค่าสำหรับสร้าง public/vendor/app.css (ดู tools/build-css.bat)
module.exports = { content: ['./public/index.html'], theme: { extend: {
  colors: { bg:'var(--bg)', card:'var(--card)', ink:'var(--ink)', mute:'var(--mute)', line:'var(--line)', brand:'var(--brand)', ok:'var(--ok)', bad:'var(--bad)', accent:'var(--accent)' },
  fontFamily: { head:['Anuphan','Noto Sans Thai','Sarabun','Leelawadee UI','Tahoma','sans-serif'], body:['IBM Plex Sans Thai','Noto Sans Thai','Sarabun','Leelawadee UI','Tahoma','sans-serif'] } } } };
