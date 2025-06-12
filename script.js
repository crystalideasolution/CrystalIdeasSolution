document.addEventListener("DOMContentLoaded", function () {
    // ... (ส่วนสคริปต์การเลื่อนที่มีอยู่ของคุณยังคงอยู่ที่นี่) ...

    // การเลือกภาษา
    const langButtons = document.querySelectorAll('.lang-btn');
    const contentElements = document.querySelectorAll('[data-en], [data-th]'); // เลือกองค์ประกอบทั้งหมดที่มีแอตทริบิวต์ data-en หรือ data-th

    /**
     * กำหนดภาษาของหน้าโดยการอัปเดตเนื้อหาข้อความตามแอตทริบิวต์ data
     * @param {string} lang - ภาษาที่ต้องการตั้งค่า ('en' สำหรับภาษาอังกฤษ, 'th' สำหรับภาษาไทย).
     */
    function setLanguage(lang) {
        contentElements.forEach(element => {
            if (element.dataset[lang]) { // ตรวจสอบว่าแอตทริบิวต์ data สำหรับภาษาที่เลือกมีอยู่หรือไม่
                element.innerHTML = element.dataset[lang]; // อัปเดตเนื้อหาขององค์ประกอบ
            }
        });

        // อัปเดตสถานะ Active สำหรับปุ่มภาษา
        langButtons.forEach(button => {
            if (button.dataset.lang === lang) {
                button.classList.add('active-lang'); // เพิ่มคลาส 'active-lang' ให้กับปุ่มที่เลือก
            } else {
                button.classList.remove('active-lang'); // ลบคลาส 'active-lang' ออกจากปุ่มอื่นๆ
            }
        });

        // จัดเก็บภาษาที่เลือกใน local storage เพื่อจดจำการตั้งค่าของผู้ใช้
        localStorage.setItem('selectedLang', lang);
    }

    // เพิ่มตัวฟังเหตุการณ์คลิกให้กับปุ่มภาษา
    langButtons.forEach(button => {
        button.addEventListener('click', () => {
            setLanguage(button.dataset.lang); // เรียกใช้ setLanguage ด้วยค่า data-lang ของปุ่ม
        });
    });

    // เมื่อโหลดหน้า ให้ตรวจสอบการตั้งค่าภาษาที่บันทึกไว้ใน local storage
    // หากพบ ให้ใช้ภาษานั้น มิฉะนั้น ให้ใช้ภาษาอังกฤษ ('en') เป็นค่าเริ่มต้น
    const savedLang = localStorage.getItem('selectedLang');
    setLanguage(savedLang || 'en'); // 'en' คือค่าเริ่มต้นหากไม่มีภาษาถูกบันทึกไว้
});
