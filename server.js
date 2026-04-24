const express = require("express")
const fs = require("fs")
const path = require("path")
const { PDFDocument } = require("pdf-lib")

const app = express()
const PORT = process.env.PORT || 3000

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

try{

const anos = fs.readdirSync(BASE_PATH)

anos.forEach(ano => {

const anoPath = path.join(BASE_PATH, ano)

if(!fs.statSync(anoPath).isDirectory()) return
if(!/^\d{4}$/.test(ano)) return

data[ano] = {}

const areas = fs.readdirSync(anoPath)

areas.forEach(area => {

const areaPath = path.join(anoPath, area)
if(!fs.statSync(areaPath).isDirectory()) return

data[ano][area] = {}

const meses = fs.readdirSync(areaPath)

meses.forEach(mes => {

const mesPath = path.join(areaPath, mes)
if(!fs.statSync(mesPath).isDirectory()) return

const arquivos = fs.readdirSync(mesPath)

data[ano][area][mes] = arquivos

})

})

})

res.json(data)

}catch(e){
console.log(e)
res.status(500).json({erro:"Erro ao acessar pastas"})
}

})


// ===============================
// 🔥 PDF DO MÊS
// ===============================
app.get("/api/pdf-mes", async (req, res) => {

try{

const { area, mes } = req.query

const ano = fs.readdirSync(BASE_PATH).find(p => /^\d{4}$/.test(p))

const pasta = path.join(BASE_PATH, ano, area, mes)

if(!fs.existsSync(pasta)){
return res.status(404).send("Pasta não encontrada")
}

let arquivos = fs.readdirSync(pasta)
.filter(a => a.toLowerCase().endsWith(".pdf"))

// ordena (01.03, 02.03...)
arquivos.sort((a,b)=>{
const da = parseInt(a.split(".")[0])
const db = parseInt(b.split(".")[0])
return da - db
})

const pdfFinal = await PDFDocument.create()

for(const arquivo of arquivos){

const caminho = path.join(pasta, arquivo)
const bytes = fs.readFileSync(caminho)

const pdf = await PDFDocument.load(bytes)

const paginas = await pdfFinal.copyPages(pdf, pdf.getPageIndices())
paginas.forEach(p => pdfFinal.addPage(p))

}

const finalBytes = await pdfFinal.save()

res.setHeader("Content-Type","application/pdf")
res.send(Buffer.from(finalBytes))

}catch(e){
console.log("ERRO PDF MES:", e)
res.status(500).send("Erro ao gerar PDF")
}

})


// ===============================
// 🔥 PDF PERÍODO (26 → 25)
// ===============================
app.get("/api/pdf-periodo", async (req, res) => {

try{

const { area, mes1, mes2 } = req.query

const ano = fs.readdirSync(BASE_PATH).find(p => /^\d{4}$/.test(p))

const pasta1 = path.join(BASE_PATH, ano, area, mes1)
const pasta2 = path.join(BASE_PATH, ano, area, mes2)

if(!fs.existsSync(pasta1) || !fs.existsSync(pasta2)){
return res.status(404).send("Pasta não encontrada")
}

let lista1 = fs.readdirSync(pasta1).filter(a => a.toLowerCase().endsWith(".pdf"))
let lista2 = fs.readdirSync(pasta2).filter(a => a.toLowerCase().endsWith(".pdf"))

// ordenar
const ordenar = (arr) => arr.sort((a,b)=>{
const da = parseInt(a.split(".")[0])
const db = parseInt(b.split(".")[0])
return da - db
})

lista1 = ordenar(lista1)
lista2 = ordenar(lista2)

// regra 26 → 25
const parte1 = lista1.filter(a => parseInt(a.split(".")[0]) >= 26)
const parte2 = lista2.filter(a => parseInt(a.split(".")[0]) <= 25)

const final = [...parte1, ...parte2]

const pdfFinal = await PDFDocument.create()

for(const nome of final){

let pasta = parte1.includes(nome) ? pasta1 : pasta2

const caminho = path.join(pasta, nome)
const bytes = fs.readFileSync(caminho)

const pdf = await PDFDocument.load(bytes)

const paginas = await pdfFinal.copyPages(pdf, pdf.getPageIndices())
paginas.forEach(p => pdfFinal.addPage(p))

}

const finalBytes = await pdfFinal.save()

res.setHeader("Content-Type","application/pdf")
res.send(Buffer.from(finalBytes))

}catch(e){
console.log("ERRO PERIODO:", e)
res.status(500).send("Erro ao gerar PDF")
}

})


// ===============================
app.listen(PORT, ()=>{
console.log("Servidor rodando em http://localhost:"+PORT)
})