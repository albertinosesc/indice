// ============================================================
//  app.js – Lógica principal + integração com GitHub (pasta /arquivos)
// ============================================================

// Estado global
let pastaHandle = null;
let arquivos = [];
let arquivoAtual = null;
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

// ==================== TEMA ====================
document.getElementById('btnTheme').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  localStorage.setItem('tema', document.body.classList.contains('dark') ? 'dark' : 'light');
});
if (localStorage.getItem('tema') === 'dark') {
  document.body.classList.add('dark');
}

// ==================================================================
// ==================== GITHUB – PASTA "arquivos/" ==================
// ==================================================================

// --- Configuração do GitHub (token + repositório) ---
let githubToken = localStorage.getItem('github_token');
let githubRepo = localStorage.getItem('github_repo') || ''; // formato: "usuario/repositorio"
let githubBranch = localStorage.getItem('github_branch') || 'main';

// Botão para configurar token/repositório
document.getElementById('btnGitHubConfig').addEventListener('click', () => {
  const token = prompt('Digite seu token de acesso do GitHub (ou deixe em branco para remover):', githubToken || '');
  if (token === null) return;
  if (token.trim() === '') {
    localStorage.removeItem('github_token');
    githubToken = null;
    alert('Token removido.');
  } else {
    localStorage.setItem('github_token', token.trim());
    githubToken = token.trim();
    alert('Token salvo.');
  }

  const repo = prompt('Digite o repositório no formato "usuario/repositorio":', githubRepo || '');
  if (repo !== null && repo.trim() !== '') {
    localStorage.setItem('github_repo', repo.trim());
    githubRepo = repo.trim();
  }

  const branch = prompt('Digite o branch (padrão: main):', githubBranch || 'main');
  if (branch !== null && branch.trim() !== '') {
    localStorage.setItem('github_branch', branch.trim());
    githubBranch = branch.trim();
  }
});

// --- Função para obter o SHA de um arquivo (dentro da pasta "arquivos/") ---
async function obterShaArquivoGitHub(nomeArquivo) {
  if (!githubToken || !githubRepo) return null;
  const caminho = `arquivos/${encodeURIComponent(nomeArquivo)}`; // <-- AQUI ESTÁ A CORREÇÃO
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

// --- Enviar um arquivo para a pasta "arquivos/" do GitHub ---
async function enviarArquivoParaGitHub(nomeArquivo, conteudo) {
  if (!githubToken) { alert('Token não configurado. Clique em 🔑 primeiro.'); return false; }
  if (!githubRepo) { alert('Repositório não configurado.'); return false; }

  const caminho = `arquivos/${encodeURIComponent(nomeArquivo)}`; // <-- AQUI ESTÁ A CORREÇÃO
  const url = `https://api.github.com/repos/${githubRepo}/contents/${caminho}`;

  let sha = await obterShaArquivoGitHub(nomeArquivo);

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

// --- Botão "Enviar para GitHub" (arquivo atual) ---
document.getElementById('btnGitHubPush').addEventListener('click', async () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  if (!githubToken) { alert('Configure o token e repositório primeiro (botão 🔑).'); return; }
  const sucesso = await enviarArquivoParaGitHub(arquivoAtual.nome, editor.value);
  if (sucesso) alert(`✅ "${arquivoAtual.nome}" enviado com sucesso para a pasta /arquivos!`);
});

// --- Botão "Puxar do GitHub" (da pasta "arquivos/") ---
document.getElementById('btnGitHubPull').addEventListener('click', async () => {
  if (!arquivoAtual) return alert('Nenhum arquivo aberto.');
  if (!githubToken || !githubRepo) { alert('Configure token e repositório (🔑).'); return; }

  const caminho = `arquivos/${encodeURIComponent(arquivoAtual.nome)}`; // <-- AQUI ESTÁ A CORREÇÃO
  const url = `https://api.github.com/repos/${githubRepo}/contents/${caminho}?ref=${githubBranch}`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `token ${githubToken}` }
    });
    if (!response.ok) {
      if (response.status === 404) {
        alert(`Arquivo "${arquivoAtual.nome}" não encontrado na pasta /arquivos do GitHub.`);
      } else {
        const error = await response.json();
        alert(`Erro: ${error.message}`);
      }
      return;
    }
    const data = await response.json();
    const conteudo = decodeURIComponent(escape(atob(data.content)));
    editor.value = conteudo;
    await salvarArquivo(arquivoAtual.handle, conteudo);
    arquivoAtual.conteudo = conteudo;
    alert(`✅ "${arquivoAtual.nome}" atualizado a partir do GitHub (pasta /arquivos).`);
  } catch (err) {
    alert(`❌ Erro ao puxar: ${err.message}`);
  }
});

// --- Botão "Sincronizar" (envia todos os arquivos locais para a pasta /arquivos) ---
document.getElementById('btnGitHubSync').addEventListener('click', async () => {
  if (!pastaHandle) return alert('Abra uma pasta primeiro.');
  if (!githubToken || !githubRepo) { alert('Configure token e repositório (🔑).'); return; }

  if (!confirm(`Enviar TODOS os ${arquivos.length} arquivos para a pasta /arquivos do GitHub?`)) return;

  let enviados = 0;
  let erros = 0;

  for (const item of arquivos) {
    const conteudo = await lerArquivo(item.handle);
    const ok = await enviarArquivoParaGitHub(item.nome, conteudo);
    if (ok) enviados++; else erros++;
  }

  alert(`✅ Sincronização concluída!\nEnviados: ${enviados}\nErros: ${erros}`);
});

// ==================== INICIALIZAÇÃO ====================
editor.placeholder = 'Clique em "Abrir Pasta" para começar.';
atualizarContador();

if (githubToken) console.log('🔑 Token do GitHub carregado.');
