// server.js
import express from "express";
import fetch from "node-fetch";
import JSZip from "jszip";
import puppeteer from "puppeteer";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// Rota principal para gerar o ZIP
app.post("/zip", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Falta o link do álbum." });

  console.log("Baixando álbum:", url);

  try {
    // 1️⃣ Inicia o navegador invisível
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "networkidle2" });

    // 2️⃣ Rola até o final pra carregar todas as imagens
    let prevHeight;
    let scrollTries = 0;
    while (scrollTries < 10) {
      const newHeight = await page.evaluate("document.body.scrollHeight");
      if (prevHeight === newHeight) {
        scrollTries++;
        await new Promise((r) => setTimeout(r, 500));
      } else {
        scrollTries = 0;
        prevHeight = newHeight;
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // 3️⃣ Coleta todas as URLs de imagem
    const imageUrls = await page.$$eval("img", (imgs) =>
      imgs
        .map((img) => img.src || img.dataset.src)
        .filter((src) => src && /\.(jpg|jpeg|png|gif|webp)$/i.test(src))
    );

    await browser.close();

    console.log(`Encontradas ${imageUrls.length} imagens.`);

    if (!imageUrls.length) {
      return res.status(404).json({ error: "Nenhuma imagem encontrada." });
    }

    // 4️⃣ Baixa e compacta as imagens
    const zip = new JSZip();
    let count = 0;

    for (const imgUrl of imageUrls) {
      count++;
      console.log(`Baixando imagem ${count}/${imageUrls.length}: ${imgUrl}`);
      try {
        const response = await fetch(imgUrl);
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        const filename = imgUrl.split("/").pop().split("?")[0] || `img${count}.jpg`;
        zip.file(filename, Buffer.from(buffer));
      } catch (e) {
        console.log("Erro ao baixar:", imgUrl, e.message);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // 5️⃣ Envia o ZIP pro navegador
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="album.zip"',
    });
    res.send(zipBuffer);
  } catch (err) {
    console.error("Erro:", err);
    res.status(500).json({ error: "Erro interno do servidor", details: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("Servidor de ZIP do imgbb ativo!");
});

app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
