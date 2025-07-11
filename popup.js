document.addEventListener("DOMContentLoaded", async () =>
{
    try
    {
        const res = await fetch("https://namazvakitleri.diyanet.gov.tr/tr-TR/9206/ankara-icin-namaz-vakti");
        const htmlText = await res.text();
    } catch (err)
    {
        console.error("Error fetching/parsing HTML:", err);
    }
});


// add button on namaz site that sends info to popup or somn idk