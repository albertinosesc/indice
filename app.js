// ============================================================
//  app.js – Lógica principal com File System Access API
// ============================================================

// Estado global
let pastaHandle = null;             // Diretório raiz escolhido
let arquivos = [];                 // Lista de {nome, handle, favorito}
let arquivoAtual = null;           // {nome, handle, conteudo}
let favoritos = JSON.parse(localStorage.getItem('favoritos') || '[]');
let historico = JSON.parse(localStorage.getItem('historico') || '[]');

// DOM
const listaEl = document.getElementById('lista-arquivos');
const editor = document.getElementById('editor');
const pesquisaInput = document.getElementById('pesquisa');
const contadorEl = document.getElementById('contador-arquivos');
const pastaAtualEl = document.getElementById('pasta-atual');
const nomeArqEl = document.getElementById('nome-arquivo');
const statsArqEl = document.getElementById('stats-arquivo');

// ==================== HELPERS ====================
function atualizarContador() {
  contadorEl.textContent = `${arquivos.length} arquivo${arquivos.length !== 1 ? 's' : ''}`;
}

function atualizarPastaAtual() {
  pastaAtualEl.textContent = pastaHandle ? `📁 ${pastaHandle.name}` : '';
}

function lerArquivo(handle) {
  return handle.getFile().then(file => file.text());
}

function salvarArquivo(handle, conteudo) {
  return handle.createWritable().then(writable => {
    return writable.write(conteudo).then(() => writable.close());
  });
}

// ==================== LISTAR ARQUIVOS ====================
async function listarArquivos(diretorio) {
  const entries = [];
  for await (const entry of diretorio.values()) {
    if (entry.kind === 'file' && entry.name.endsWith('.txt')) {
      entries.push({
        nome: entry.name,
        handle: entry,
        favorito: favoritos.includes(entry.name)
      });
    }
  }
  // Ordenar: favoritos primeiro, depois alfabética
  entries.sort((a, b) => {
    if (a.favorito && !b.favorito) return -1;
    if (!a.favorito && b.favorito) return 1;
    return a.nome.localeCompare(b.nome);
  });
  return entries;
}

function renderizarLista(filtro = '') {
  const filtroLower = filtro.toLowerCase();
  const filtrados = arquivos.filter(item =>
    item.nome.toLowerCase().includes(filtroLower)
  );
  let html = '';
  filtrados.forEach(item => {
    const estrela = item.favorito ? '⭐' : '';
    html += `
      <div class="item" data-nome="${item.nome}">
        <span class="nome">📄 ${item.nome}</span>
        <span class="icone-fav">${estrela}</span>
      </div>
    `;
  });
  listaEl.innerHTML = html || '<div style="padding:20px;color:#999;">Nenhum arquivo encontrado.</div>';

  // Eventos de clique nos itens
  listaEl.querySelectorAll('.item').forEach(el => {
    el.addEventListener('click', () => {
      const nome = el.dataset.nome;
      abrirArquivo(nome);
    });
  });
}

// ==================== ABRIR PASTA ====================
document.getElementById('btnOpenFolder').addEventListener('click', async () => {
  try {
    pastaHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await carregarPasta();
  } catch (err) {
    if (err.name !== 'AbortError') alert('Erro ao abrir pasta: ' + err.message);
  }
});

async function carregarPasta() {
  if (!pastaHandle) return;
  arquivos = await listarArquivos(pastaHandle);
  atualizarContador();
  atualizarPastaAtual();
  renderizarLista(pesquisaInput.value);
  // Se houver histórico, abre o primeiro da lista ou o último acessado
  if (arquivos.length > 0) {
    const ultimo = historico[0] || arquivos[0].nome;
    if (arquivos.some(a => a.nome === ultimo)) {
      abrirArquivo(ultimo);
    } else {
      abrirArquivo(arquivos[0].nome);
    }
  } else {
    editor.value = '';
    nomeArqEl.textContent = 'Nenhum arquivo .txt';
    statsArqEl.textContent = '';
  }
}

// ==================== ABRIR ARQUIVO ====================
async function abrirArquivo(nome) {
  const item = arquivos.find(a => a.nome === nome);
  if (!item) return;
  try {
    const conteudo = await lerArquivo(item.handle);
    arquivoAtual = { nome, handle: item.handle, conteudo };
    editor.value = conteudo;
    nomeArqEl.textContent = `📄 ${nome}`;
    // Atualizar estatísticas
    const palavras = conteudo.split(/\s+/).filter(w => w.length > 0).length;
    const caracteres = conteudo.length;
    statsArqEl.textContent = `Palavras: ${palavras} | Caracteres: ${caracteres}`;
    // Histórico
    historico = historico.filter(h => h !== nome);
    historico.unshift(nome);
    if (historico.length > 50) historico.pop();
    localStorage.setItem('historico', JSON.stringify(historico));
    // Destaque na lista
    document.querySelectorAll('.item').forEach(el => {
      el.style.background = el.dataset.nome === nome ? '#bbdefb' : '';
    });
  } catch (err) {
    alert('Erro ao ler arquivo: ' + err.message);
  }
}

// ==================== SALVAR ====================
document.getElementById('btnSave').addEventListener('click', async () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  try {
    await salvarArquivo(arquivoAtual.handle, editor.value);
    arquivoAtual.conteudo = editor.value;
    alert('✅ Arquivo salvo!');
  } catch (err) {
    alert('Erro ao salvar: ' + err.message);
  }
});

// ==================== NOVO ARQUIVO ====================
document.getElementById('btnNewFile').addEventListener('click', async () => {
  if (!pastaHandle) return alert('Primeiro abra uma pasta.');
  const nome = prompt('Nome do novo arquivo (ex: meu.txt):');
  if (!nome) return;
  if (!nome.endsWith('.txt')) return alert('O nome deve terminar com .txt');
  try {
    const novoHandle = await pastaHandle.getFileHandle(nome, { create: true });
    await salvarArquivo(novoHandle, '');
    // Recarregar lista
    await carregarPasta();
    abrirArquivo(nome);
  } catch (err) {
    alert('Erro ao criar arquivo: ' + err.message);
  }
});

// ==================== RENOMEAR ====================
document.getElementById('btnRename').addEventListener('click', async () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  const novoNome = prompt('Novo nome (inclua .txt):', arquivoAtual.nome);
  if (!novoNome || novoNome === arquivoAtual.nome) return;
  if (!novoNome.endsWith('.txt')) return alert('Deve terminar com .txt');
  try {
    // A API não tem rename direto, então copiamos para novo e excluímos antigo
    const conteudo = await lerArquivo(arquivoAtual.handle);
    const novoHandle = await pastaHandle.getFileHandle(novoNome, { create: true });
    await salvarArquivo(novoHandle, conteudo);
    await arquivoAtual.handle.remove();
    // Atualizar favoritos e histórico
    favoritos = favoritos.map(f => f === arquivoAtual.nome ? novoNome : f);
    localStorage.setItem('favoritos', JSON.stringify(favoritos));
    historico = historico.map(h => h === arquivoAtual.nome ? novoNome : h);
    localStorage.setItem('historico', JSON.stringify(historico));
    await carregarPasta();
    abrirArquivo(novoNome);
  } catch (err) {
    alert('Erro ao renomear: ' + err.message);
  }
});

// ==================== EXCLUIR ====================
document.getElementById('btnDelete').addEventListener('click', async () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  if (!confirm(`Excluir definitivamente "${arquivoAtual.nome}"?`)) return;
  try {
    await arquivoAtual.handle.remove();
    favoritos = favoritos.filter(f => f !== arquivoAtual.nome);
    localStorage.setItem('favoritos', JSON.stringify(favoritos));
    historico = historico.filter(h => h !== arquivoAtual.nome);
    localStorage.setItem('historico', JSON.stringify(historico));
    arquivoAtual = null;
    editor.value = '';
    nomeArqEl.textContent = '';
    statsArqEl.textContent = '';
    await carregarPasta();
  } catch (err) {
    alert('Erro ao excluir: ' + err.message);
  }
});

// ==================== FAVORITAR ====================
document.getElementById('btnFavorite').addEventListener('click', () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  const nome = arquivoAtual.nome;
  const idx = favoritos.indexOf(nome);
  if (idx >= 0) {
    favoritos.splice(idx, 1);
  } else {
    favoritos.push(nome);
  }
  localStorage.setItem('favoritos', JSON.stringify(favoritos));
  // Atualizar lista e recarregar
  arquivos.forEach(a => a.favorito = favoritos.includes(a.nome));
  renderizarLista(pesquisaInput.value);
  // Reabrir para atualizar estrela
  abrirArquivo(nome);
});

// ==================== PESQUISA ====================
pesquisaInput.addEventListener('input', () => {
  renderizarLista(pesquisaInput.value);
});

// ==================== EXPORTAR PDF ====================
document.getElementById('btnExportPDF').addEventListener('click', () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text(editor.value, 10, 10, { maxWidth: 180 });
  doc.save(`${arquivoAtual.nome.replace('.txt', '')}.pdf`);
});

// ==================== EXPORTAR ZIP ====================
document.getElementById('btnExportZIP').addEventListener('click', async () => {
  if (!pastaHandle || arquivos.length === 0) return alert('Nenhum arquivo para exportar.');
  const zip = new JSZip();
  for (const item of arquivos) {
    const conteudo = await lerArquivo(item.handle);
    zip.file(item.nome, conteudo);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'biblioteca_txt.zip';
  link.click();
  URL.revokeObjectURL(link.href);
});

// ==================== BACKUP ====================
document.getElementById('btnBackup').addEventListener('click', async () => {
  if (!pastaHandle) return alert('Abra uma pasta primeiro.');
  try {
    // Cria uma subpasta "backup" dentro da pasta atual (se não existir)
    let backupHandle;
    try {
      backupHandle = await pastaHandle.getDirectoryHandle('backup', { create: true });
    } catch {
      backupHandle = await pastaHandle.getDirectoryHandle('backup');
    }
    let copiados = 0;
    for (const item of arquivos) {
      const conteudo = await lerArquivo(item.handle);
      const novoHandle = await backupHandle.getFileHandle(item.nome, { create: true });
      await salvarArquivo(novoHandle, conteudo);
      copiados++;
    }
    alert(`✅ Backup concluído! ${copiados} arquivos copiados para /backup`);
  } catch (err) {
    alert('Erro no backup: ' + err.message);
  }
});

// ==================== ESTATÍSTICAS ====================
document.getElementById('btnStats').addEventListener('click', () => {
  if (!pastaHandle) return alert('Abra uma pasta primeiro.');
  let totalPalavras = 0;
  let totalCaracteres = 0;
  Promise.all(arquivos.map(item => lerArquivo(item.handle))).then(conteudos => {
    conteudos.forEach(texto => {
      totalPalavras += texto.split(/\s+/).filter(w => w.length > 0).length;
      totalCaracteres += texto.length;
    });
    alert(
      `📊 Estatísticas da pasta\n` +
      `Arquivos: ${arquivos.length}\n` +
      `Total de palavras: ${totalPalavras}\n` +
      `Total de caracteres: ${totalCaracteres}`
    );
  });
});

// ==================== TEMA CLARO/ESCURO ====================
document.getElementById('btnTheme').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('tema', document.body.classList.contains('dark') ? 'dark' : 'light');
});
// Restaurar tema
if (localStorage.getItem('tema') === 'dark') {
  document.body.classList.add('dark');
}

// ==================== INICIALIZAÇÃO ====================
// Se já houver pasta aberta (não temos, pois é nova sessão), mas tentamos carregar do cache?
// Não há cache de pasta, então apenas exibe mensagem.
editor.placeholder = 'Clique em "Abrir Pasta" para começar.';
atualizarContador();