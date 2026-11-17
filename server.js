const express = require("express")
const fs = require("fs")
const path = require("path")
const { PDFDocument } = require("pdf-lib")

const app = express()
const PORT = process.env.PORT || 3005

app.use(express.static(__dirname))

// base do projeto
const BASE_PATH = __dirname

// acessar arquivos direto
app.use("/arquivos", express.static(BASE_PATH))

// ===============================
// 🔹 API RDO (ORIGINAL)
// ===============================
app.get("/api/rdos", (req, res) => {
  let data = {}

  try {
    const anos = fs.readdirSync(BASE_PATH)

    anos.forEach(ano => {
      const anoPath = path.join(BASE_PATH, ano)

      if (!fs.statSync(anoPath).isDirectory()) return
      if (!/^\d{4}$/.test(ano)) return

      data[ano] = {}

      const areas = fs.readdirSync(anoPath)

      areas.forEach(area => {
        const areaPath = path.join(anoPath, area)
        if (!fs.statSync(areaPath).isDirectory()) return

        data[ano][area] = {}

        const meses = fs.readdirSync(areaPath)

        meses.forEach(mes => {
          const mesPath = path.join(areaPath, mes)
          if (!fs.statSync(mesPath).isDirectory()) return

          const arquivos = fs.readdirSync(mesPath)
          data[ano][area][mes] = arquivos
        })
      })
    })

    res.json(data)
  } catch (e) {
    console.log(e)
    res.status(500).json({ erro: "Erro ao acessar pastas" })
  }
})

// Função auxiliar de validação de caminho seguro
function resolverCaminhoSeguro(...partes) {
  const caminhoCompleto = path.resolve(BASE_PATH, ...partes)
  if (!caminhoCompleto.startsWith(path.resolve(BASE_PATH))) {
    return null
  }
  return caminhoCompleto
}

// ===============================
// 🔥 PDF DO MÊS
// ===============================
app.get("/api/pdf-mes", async (req, res) => {
  try {
    let { area, mes, ano } = req.query

    // Se ano não for passado, localiza o ano no sistema
    if (!ano || !/^\d{4}$/.test(ano)) {
      ano = fs.readdirSync(BASE_PATH).find(p => /^\d{4}$/.test(p))
    }

    if (!area || !mes || !ano) {
      return res.status(400).send("Parâmetros inválidos")
    }

    const pasta = resolverCaminhoSeguro(ano, area, mes)
    if (!pasta || !fs.existsSync(pasta)) {
      return res.status(404).send("Pasta não encontrada")
    }

    let arquivos = fs.readdirSync(pasta)
      .filter(a => a.toLowerCase().endsWith(".pdf"))

    if (arquivos.length === 0) {
      return res.status(404).send("Nenhum arquivo PDF encontrado neste mês")
    }

    // ordena (01.03, 02.03...)
    arquivos.sort((a, b) => {
      const da = parseInt(a.split(".")[0]) || 0
      const db = parseInt(b.split(".")[0]) || 0
      return da - db
    })

    const pdfFinal = await PDFDocument.create()
    let paginasAdicionadas = 0

    for (const arquivo of arquivos) {
      try {
        const caminho = path.join(pasta, arquivo)
        const bytes = fs.readFileSync(caminho)
        const pdf = await PDFDocument.load(bytes)
        const paginas = await pdfFinal.copyPages(pdf, pdf.getPageIndices())
        paginas.forEach(p => pdfFinal.addPage(p))
        paginasAdicionadas += paginas.length
      } catch (errPdf) {
        console.warn(`Aviso: Falha ao ler PDF '${arquivo}':`, errPdf.message)
      }
    }

    if (paginasAdicionadas === 0) {
      return res.status(500).send("Nenhuma página válida pôde ser extraída dos PDFs.")
    }

    const finalBytes = await pdfFinal.save()

    res.setHeader("Content-Type", "application/pdf")
    res.send(Buffer.from(finalBytes))
  } catch (e) {
    console.log("ERRO PDF MES:", e)
    res.status(500).send("Erro ao gerar PDF")
  }
})

// ===============================
// 🔥 PDF PERÍODO (26 → 25)
// ===============================
app.get("/api/pdf-periodo", async (req, res) => {
  try {
    let { area, mes1, mes2, ano } = req.query

    if (!ano || !/^\d{4}$/.test(ano)) {
      ano = fs.readdirSync(BASE_PATH).find(p => /^\d{4}$/.test(p))
    }

    if (!area || !mes1 || !mes2 || !ano) {
      return res.status(400).send("Parâmetros inválidos")
    }

    const pasta1 = resolverCaminhoSeguro(ano, area, mes1)
    const pasta2 = resolverCaminhoSeguro(ano, area, mes2)

    if (!pasta1 || !pasta2 || !fs.existsSync(pasta1) || !fs.existsSync(pasta2)) {
      return res.status(404).send("Pasta de um dos meses não foi encontrada")
    }

    let lista1 = fs.readdirSync(pasta1).filter(a => a.toLowerCase().endsWith(".pdf"))
    let lista2 = fs.readdirSync(pasta2).filter(a => a.toLowerCase().endsWith(".pdf"))

    // ordenar
    const ordenar = (arr) => arr.sort((a, b) => {
      const da = parseInt(a.split(".")[0]) || 0
      const db = parseInt(b.split(".")[0]) || 0
      return da - db
    })

    lista1 = ordenar(lista1)
    lista2 = ordenar(lista2)

    // regra 26 → 25
    const parte1 = lista1.filter(a => (parseInt(a.split(".")[0]) || 0) >= 26)
    const parte2 = lista2.filter(a => (parseInt(a.split(".")[0]) || 0) <= 25)

    const final = [...parte1, ...parte2]

    if (final.length === 0) {
      return res.status(404).send("Nenhum PDF encontrado no período 26 a 25 selecionado.")
    }

    const pdfFinal = await PDFDocument.create()
    let paginasAdicionadas = 0

    for (const nome of final) {
      try {
        let pasta = parte1.includes(nome) ? pasta1 : pasta2
        const caminho = path.join(pasta, nome)
        const bytes = fs.readFileSync(caminho)
        const pdf = await PDFDocument.load(bytes)
        const paginas = await pdfFinal.copyPages(pdf, pdf.getPageIndices())
        paginas.forEach(p => pdfFinal.addPage(p))
        paginasAdicionadas += paginas.length
      } catch (errPdf) {
        console.warn(`Aviso: Falha ao mesclar '${nome}':`, errPdf.message)
      }
    }

    if (paginasAdicionadas === 0) {
      return res.status(500).send("Nenhuma página válida pôde ser extraída dos PDFs do período.")
    }

    const finalBytes = await pdfFinal.save()

    res.setHeader("Content-Type", "application/pdf")
    res.send(Buffer.from(finalBytes))
  } catch (e) {
    console.log("ERRO PERIODO:", e)
    res.status(500).send("Erro ao gerar PDF")
  }
})

// ===============================
app.listen(PORT, () => {
  console.log("Servidor rodando em http://localhost:" + PORT)
})