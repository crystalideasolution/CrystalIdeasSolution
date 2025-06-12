<script>
  const scrollContainer = document.getElementById("scrollable-services");
  const btnLeft = document.querySelector(".scroll-btn.left");
  const btnRight = document.querySelector(".scroll-btn.right");

  const scrollAmount = 300; // ระยะเลื่อน (พิกเซล)

  btnLeft.addEventListener("click", () = {
    scrollContainer.scrollBy({ left: -scrollAmount, behavior: "smooth" })
  });

  btnRight.addEventListener("click", () = {
    scrollContainer.scrollBy({ left: scrollAmount, behavior: "smooth" })
  });
</script>
