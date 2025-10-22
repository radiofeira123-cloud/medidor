import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import archiver from "archiver";
import { tmpdir } from "os";
import path from "path";
import { createWriteStream } from "fs";
import { fileURLToPath } from "url";

// Configuração básica
const app = express();
app.use(express.json());

// 🔥 Libera acesso de outros domínios (como Vercel ou GitHub Pages)
app.use(cors({
  origin: "*"
}));

// Rota inicial opcional
app.get("/", (req, res) => {
  res.send("✅ Servidor de download do imgbb está online!");
});

// Rota principal que baixa o álbum e gera o ZIP
app.post("/baixar", async (req, res) => {
  const { albumUrl } = req.body;

  if (!albumUrl) {
    return res.status(400).json({ error: "Faltando link do álbum" });
  }

  try {
    // Busca o HTML do álbum
    const html = await fetch(albumUrl).then(r => r.text());

    // Expressão regular pra encontrar todos os links de imagens
    const urls = [...html.matchAll(/https:\/\/i\.ibb\.co\/[^\s"']+\.(jpg|jpeg|png|gif)/g)].map(m => m[0]);

    if (urls.length === 0) {
      return res.status(404).json({ error: "Nenhuma imagem encontrada no álbum" });
    }

    // Cria um arquivo ZIP temporário
    const tempPath = path.join(tmpdir(), `album_imgbb_${Date.now()}.zip`);
    const output = createWriteStream(tempPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    // Faz o download de cada imagem e adiciona ao ZIP
    for (let i = 0; i < urls.length; i++) {
      const imgUrl = urls[i];
      const imgResp = await fetch(imgUrl);
      const buffer = await imgResp.arrayBuffer();
      archive.append(Buffer.from(buffer), { name: `imagem_${i + 1}.jpg` });
      console.log(`Baixada ${i + 1}/${urls.length}`);
    }

    await archive.finalize();

    output.on("close", () => {
      res.download(tempPath, "album_imgbb.zip", err => {
        if (err) console.error("Erro ao enviar ZIP:", err);
      });
    });

  } catch (err) {
    console.error("Erro ao processar álbum:", err);
    res.status(500).json({ error: "Erro interno ao baixar o álbum" });
  }
});

// Render exige que a porta venha do ambiente
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
