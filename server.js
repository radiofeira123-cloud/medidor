import express from "express";
import puppeteer from "puppeteer";
import JSZip from "jszip";
import axios from "axios";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS liberado pro teu frontend do GitHub Pages
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.post("/download-album", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL do álbum não fornecida." });

  console.log("🔗 Recebendo álbum:", url);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=album.zip");

  try {
    // abre o navegador invisível
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

    // rola até o fim do álbum pra carregar todas as imagens
    let lastHeight = await page.evaluate("document.body.scrollHeight");
    while (true) {
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      await page.waitForTimeout(1500);
      let newHeight = await page.evaluate("document.body.scrollHeight");
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }

    // pega todas as URLs de imagem
    const imageUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs
        .map((img) => img.src)
        .filter((src) => src && /ibb\.co|i\.ibb\.co|iili\.io/i.test(src));
    });

    console.log(`🖼️ Encontradas ${imageUrls.length} imagens.`);
    await browser.close();

    // baixa e compacta tudo
    const zip = new JSZip();
    let count = 0;

    for (const imgUrl of imageUrls) {
      try {
        const response = await axios.get(imgUrl, { responseType: "arraybuffer" });
        const fileName =
          imgUrl.split("/").pop().split("?")[0] || `img-${++count}.jpg`;
        zip.file(fileName, response.data);
        console.log(`✔️ ${fileName}`);
      } catch (err) {
        console.log(`❌ Falha ao baixar ${imgUrl}`);
      }
    }

    const zipData = await zip.generateAsync({ type: "nodebuffer" });
    res.end(zipData);
  } catch (err) {
    console.error("Erro:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () =>
  console.log(`🚀 Servidor rodando na porta ${port}`)
);
