document.addEventListener("DOMContentLoaded", function () {
    const scrollContainer = document.getElementById("scrollable-services");
    const leftBtn = document.querySelector(".scroll-btn.left");
    const rightBtn = document.querySelector(".scroll-btn.right");

    const item = scrollContainer.querySelector(".content-item");
    const itemWidth = item.offsetWidth + parseInt(getComputedStyle(item).marginRight);

    // เมื่อคลิกเลื่อนซ้าย
    leftBtn.addEventListener("click", () => {
        scrollContainer.scrollBy({ left: -itemWidth, behavior: "smooth" });
    });

    // เมื่อคลิกเลื่อนขวา
    rightBtn.addEventListener("click", () => {
        scrollContainer.scrollBy({ left: itemWidth, behavior: "smooth" });
    });

    // ตรวจสอบ scroll และแสดง/ซ่อนปุ่มลูกศรซ้าย
    scrollContainer.addEventListener("scroll", () => {
        if (scrollContainer.scrollLeft > 0) {
            leftBtn.style.display = "flex"; // แสดงปุ่ม (ใช้ flex เพราะใช้ใน CSS ด้วย)
        } else {
            leftBtn.style.display = "none"; // ซ่อนไว้หากยังอยู่จุดเริ่มต้น
        }
    });
});
