# วิธีได้ไฟล์ APK (Android) — เลือกทางใดทางหนึ่ง

## ทาง A: ไม่ต้องลงโปรแกรมอะไร (GitHub Actions, ฟรี)
1. สมัคร GitHub แล้วสร้าง repository ใหม่ (Private ก็ได้)
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์ `hachang` ขึ้นไป (รวมโฟลเดอร์ `.github` ซึ่งเป็นโฟลเดอร์ซ่อน)
3. เปิดแท็บ **Actions** > **Build Android APK** > **Run workflow** รอประมาณ 3-6 นาที
4. เปิดงานที่รันเสร็จ > ส่วน **Artifacts** > ดาวน์โหลด `hachang-debug-apk` (แตกซิปได้ `app-debug.apk`)
5. ส่งไฟล์เข้ามือถือ แตะติดตั้ง (อนุญาต "ติดตั้งแอปจากแหล่งที่ไม่รู้จัก") — เป็นไฟล์ debug ที่เซ็นอัตโนมัติ ใช้ทดสอบได้ทันที

## ทาง B: Android Studio
เปิดโฟลเดอร์ `android` > รอ Gradle Sync > Build > Build APK(s) (รายละเอียดใน `android/README.md`)

## ก่อนเปิดแอป
- บนคอมพิวเตอร์: รัน `start-phone.bat` (มือถือกับคอมพิวเตอร์ต้อง Wi-Fi เดียวกัน)
- ครั้งแรกที่เปิดแอป ใส่ `http://IP-ที่แสดงในหน้าต่างรัน:3000`
- การโทร/GPS ต้องใช้ HTTPS หรือ localhost (ดู `android/README.md`)
