// ============================================================
//  app.js – Lógica principal + integração com GitHub (pasta dinâmica)
// ============================================================

// ==================== ESTADO GLOBAL ====================
let pastaHandle = null;
let arquivos = [];
let arquivoAtual = null;
let favoritos = JSON.parse(localStorage.getItem('favoritos') || '[]');
let historico = JSON.parse(localStorage.getItem('historico') || '[]');

// Configurações GitHub (persistentes)
let githubToken = localStorage.getItem('github_token') || '';
let githubRepo = localStorage.getItem('github_repo') || '';
let githubBranch = localStorage.getItem('github_branch') || 'main';
let githubPasta = localStorage.getItem('github_pasta') || 'arquivos/'; // padrão

// ==================== DOM ====================
const listaEl = document.getElementById('lista-arquivos');
const editor = document.getElementById('editor');
const pesquisaInput = document.getElementById('pesquisa');
const contadorEl = document.getElementById('contador-arquivos');
const pastaAtualEl = document.getElementById('pasta-atual');
const nomeArqEl = document.getElementById('nome-arquivo');
const statsArqEl = document.getElementById('stats-arquivo');

// ==================== HELPERS LOCAIS ====================
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
    const palavras = conteudo.split(/\s+/).filter(w => w.length > 0).length;
    const caracteres = conteudo.length;
    statsArqEl.textContent = `Palavras: ${palavras} | Caracteres: ${caracteres}`;
    historico = historico.filter(h => h !== nome);
    historico.unshift(nome);
    if (historico.length > 50) historico.pop();
    localStorage.setItem('historico', JSON.stringify(historico));
    document.querySelectorAll('.item').forEach(el => {
      el.style.background = el.dataset.nome === nome ? '#bbdefb' : '';
    });
  } catch (err) {
    alert('Erro ao ler arquivo: ' + err.message);
  }
}

// ==================== SALVAR LOCAL ====================
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
    const conteudo = await lerArquivo(arquivoAtual.handle);
    const novoHandle = await pastaHandle.getFileHandle(novoNome, { create: true });
    await salvarArquivo(novoHandle, conteudo);
    await arquivoAtual.handle.remove();
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
  arquivos.forEach(a => a.favorito = favoritos.includes(a.nome));
  renderizarLista(pesquisaInput.value);
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
if (localStorage.getItem('tema') === 'dark') {
  document.body.classList.add('dark');
}

// ==================================================================
// ==================== GITHUB – PASTA DINÂMICA ====================
// ==================================================================

// --- Botão de configuração (🔑) ---
document.getElementById('btnGitHubConfig').addEventListener('click', () => {
  // Token
  const token = prompt('Digite seu token de acesso do GitHub (ou deixe em branco para remover):', githubToken || '');
  if (token === null) return;
  if (token.trim() === '') {
    localStorage.removeItem('github_token');
    githubToken = '';
    alert('Token removido.');
  } else {
    localStorage.setItem('github_token', token.trim());
    githubToken = token.trim();
    alert('Token salvo.');
  }

  // Repositório
  const repo = prompt('Digite o repositório no formato "usuario/repositorio":', githubRepo || '');
  if (repo !== null && repo.trim() !== '') {
    localStorage.setItem('github_repo', repo.trim());
    githubRepo = repo.trim();
  }

  // Branch
  const branch = prompt('Digite o branch (padrão: main):', githubBranch || 'main');
  if (branch !== null && branch.trim() !== '') {
    localStorage.setItem('github_branch', branch.trim());
    githubBranch = branch.trim();
  }

  // Pasta de destino padrão
  const pasta = prompt('Pasta de destino padrão no repositório (ex: arquivos/, conteudo/, ou vazio para raiz):', githubPasta || '');
  if (pasta !== null) {
    let pastaTratada = pasta.trim();
    if (pastaTratada && !pastaTratada.endsWith('/')) pastaTratada += '/';
    localStorage.setItem('github_pasta', pastaTratada);
    githubPasta = pastaTratada;
    alert(`Pasta padrão definida: "${githubPasta || 'raiz'}"`);
  }
});

// --- Função para obter SHA de um arquivo (em qualquer pasta) ---
async function obterShaArquivoGitHub(nomeArquivo, pasta) {
  if (!githubToken || !githubRepo) return null;
  const caminho = pasta + encodeURIComponent(nomeArquivo);
  const url = `https://api.github.com/repos/${githubRepo}/contents/${caminho}`;
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `token ${githubToken}` }
    });
    if (response.ok) {
      const data = await response.json();
      return data.sha;
    }
    return null;
  } catch {
    return null;
  }
}

// --- Função para enviar um arquivo para uma pasta específica ---
async function enviarArquivoParaGitHub(nomeArquivo, conteudo, pasta) {
  if (!githubToken) { alert('Token não configurado. Clique em 🔑 primeiro.'); return false; }
  if (!githubRepo) { alert('Repositório não configurado.'); return false; }

  const caminho = pasta + encodeURIComponent(nomeArquivo);
  const url = `https://api.github.com/repos/${githubRepo}/contents/${caminho}`;

  // Obter SHA (se existir)
  let sha = await obterShaArquivoGitHub(nomeArquivo, pasta);

  // Codificar conteúdo para Base64
  const contentBase64 = btoa(unescape(encodeURIComponent(conteudo)));

  const body = {
    message: `Atualizando ${nomeArquivo} via BibliotecaTXT-Pro`,
    content: contentBase64,
    branch: githubBranch
  };
  if (sha) body.sha = sha;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Erro desconhecido');
    }
    return true;
  } catch (err) {
    alert(`❌ Erro ao enviar "${nomeArquivo}": ${err.message}`);
    return false;
  }
}

// --- Botão "Enviar para GitHub" (arquivo atual, com escolha de pasta) ---
document.getElementById('btnGitHubPush').addEventListener('click', async () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  if (!githubToken) { alert('Configure o token e repositório primeiro (botão 🔑).'); return; }

  // Pergunta se quer usar a pasta padrão
  const usarPadrao = confirm(`Usar pasta padrão "${githubPasta || 'raiz'}"? (Clique em "Cancelar" para especificar outra)`);
  let pastaDestino = githubPasta;
  if (!usarPadrao) {
    const resp = prompt('Digite a pasta de destino (ex: conteudo/, musica/, ou vazio para raiz):', '');
    if (resp === null) return; // cancelou
    let pastaDigitada = resp.trim();
    if (pastaDigitada && !pastaDigitada.endsWith('/')) pastaDigitada += '/';
    pastaDestino = pastaDigitada;
  }

  const sucesso = await enviarArquivoParaGitHub(arquivoAtual.nome, editor.value, pastaDestino);
  if (sucesso) alert(`✅ "${arquivoAtual.nome}" enviado para "${pastaDestino || 'raiz'}"!`);
});

// --- Botão "Puxar do GitHub" (escolhe a pasta de origem) ---
document.getElementById('btnGitHubPull').addEventListener('click', async () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  if (!githubToken || !githubRepo) { alert('Configure token e repositório (🔑).'); return; }

  const pastaOrigem = prompt('Pasta de origem no GitHub (ex: arquivos/, conteudo/, ou vazio para raiz):', githubPasta || '');
  if (pastaOrigem === null) return;
  let pastaTratada = pastaOrigem.trim();
  if (pastaTratada && !pastaTratada.endsWith('/')) pastaTratada += '/';

  const caminho = pastaTratada + encodeURIComponent(arquivoAtual.nome);
  const url = `https://api.github.com/repos/${githubRepo}/contents/${caminho}?ref=${githubBranch}`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `token ${githubToken}` }
    });
    if (!response.ok) {
      if (response.status === 404) {
        alert(`Arquivo "${arquivoAtual.nome}" não encontrado na pasta "${pastaTratada || 'raiz'}" do GitHub.`);
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message}`);
      }
      return;
    }
    const data = await response.json();
    // Decodificar Base64
    const conteudo = decodeURIComponent(escape(atob(data.content)));
    // Atualizar editor e salvar localmente
    editor.value = conteudo;
    await salvarArquivo(arquivoAtual.handle, conteudo);
    arquivoAtual.conteudo = conteudo;
    alert(`✅ "${arquivoAtual.nome}" atualizado a partir de "${pastaTratada || 'raiz'}" no GitHub.`);
  } catch (err) {
    alert(`❌ Erro ao puxar: ${err.message}`);
  }
});

// --- Botão "Sincronizar" (envia todos os arquivos para uma pasta única) ---
document.getElementById('btnGitHubSync').addEventListener('click', async () => {
  if (!pastaHandle) return alert('Abra uma pasta primeiro.');
  if (!githubToken || !githubRepo) { alert('Configure token e repositório (🔑).'); return; }

  const pasta = prompt('Pasta de destino para TODOS os arquivos (ex: conteudo/, musica/, ou vazio para raiz):', githubPasta || '');
  if (pasta === null) return;
  let pastaTratada = pasta.trim();
  if (pastaTratada && !pastaTratada.endsWith('/')) pastaTratada += '/';

  if (!confirm(`Enviar TODOS os ${arquivos.length} arquivos para "${pastaTratada || 'raiz'}"?`)) return;

  let enviados = 0, erros = 0;
  for (const item of arquivos) {
    const conteudo = await lerArquivo(item.handle);
    const ok = await enviarArquivoParaGitHub(item.nome, conteudo, pastaTratada);
    if (ok) enviados++; else erros++;
  }
  alert(`✅ Sincronização concluída!\nEnviados: ${enviados}\nErros: ${erros}`);
});

// ==================== INICIALIZAÇÃO ====================
editor.placeholder = 'Clique em "Abrir Pasta" para começar.';
atualizarContador();

if (githubToken) console.log('🔑 Token do GitHub carregado.');
console.log(`📂 Pasta padrão GitHub: "${githubPasta || 'raiz'}"`);
