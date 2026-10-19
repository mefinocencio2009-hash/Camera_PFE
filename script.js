'use strict';

/* =========================================================================
   Camera_PFE — Captura com efeito visual, identificação e data/hora
   Recursos nativos: MediaDevices/getUserMedia, Canvas 2D, DOM e eventos.
   ========================================================================= */

/* ------------------------- Referências do DOM ------------------------- */
const video        = document.getElementById('video');
const canvas       = document.getElementById('canvas');
const ctx          = canvas.getContext('2d');

const inputNome    = document.getElementById('nome');
const selectEfeito = document.getElementById('efeito');

const btnLigar     = document.getElementById('btnLigar');
const btnCapturar  = document.getElementById('btnCapturar');
const btnDesligar  = document.getElementById('btnDesligar');
const btnDownload  = document.getElementById('btnDownload');

const mensagem     = document.getElementById('mensagem');
const avisoVideo   = document.getElementById('avisoVideo');
const avisoCanvas  = document.getElementById('avisoCanvas');

/* ------------------------------ Estado ------------------------------- */
let stream = null; // MediaStream ativo — null significa câmera desligada

/* --------------------------- Utilitários UI --------------------------- */
function mostrarMensagem(texto, tipo = 'info') {
  mensagem.textContent = texto;
  mensagem.className = 'mensagem ' + tipo;
}

/** Sincroniza o estado dos botões com o estado real do stream. */
function atualizarBotoes() {
  const ligada = stream !== null;
  btnLigar.disabled     = ligada;
  btnDesligar.disabled  = !ligada;
  btnCapturar.disabled  = !ligada;
}

/* --------------------------- RF01 — Ligar ---------------------------- */
async function ligarCamera() {
  if (stream) return; // evita abrir dois streams simultâneos

  // Verificação de suporte do navegador
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarMensagem(
      'Seu navegador não suporta getUserMedia. Utilize um navegador atualizado ' +
      'e acesse a página via HTTPS ou localhost.',
      'erro'
    );
    return;
  }

  try {
    mostrarMensagem('Solicitando permissão para usar a câmera…', 'info');

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width:      { ideal: 1280 },
        height:     { ideal: 720 },
        facingMode: 'user'
      },
      audio: false
    });

    video.srcObject = stream;

    // O atributo autoplay já cobre a maioria dos casos; play() é reforço.
    try { await video.play(); } catch (_) { /* autoplay bloqueado */ }

    video.classList.add('ativa');
    avisoVideo.hidden = true;

    atualizarBotoes();
    mostrarMensagem('Câmera ligada. Escolha o efeito e clique em “Capturar”.', 'ok');

  } catch (erro) {
    stream = null;
    tratarErroCamera(erro);
  }
}

/* ------------------- RF07 — Tratamento de situações ------------------- */
function tratarErroCamera(erro) {
  switch (erro.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      mostrarMensagem(
        'Permissão de câmera negada. Clique no ícone de cadeado na barra de ' +
        'endereços, permita o acesso à câmera e tente novamente.',
        'erro'
      );
      break;

    case 'NotFoundError':
    case 'OverconstrainedError':
      mostrarMensagem(
        'Nenhuma câmera foi encontrada neste dispositivo. Conecte uma câmera ' +
        'e recarregue a página.',
        'erro'
      );
      break;

    case 'NotReadableError':
      mostrarMensagem(
        'A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.',
        'erro'
      );
      break;

    case 'AbortError':
      mostrarMensagem('O acesso à câmera foi interrompido inesperadamente.', 'erro');
      break;

    default:
      mostrarMensagem(`Não foi possível acessar a câmera (${erro.name}: ${erro.message}).`, 'erro');
  }
}

/* ---------------- RF06 — Desligar câmera (stop nos tracks) ------------ */
function desligarCamera() {
  if (!stream) {
    mostrarMensagem('A câmera já está desligada.', 'info');
    return;
  }

  // ⚠️ Ponto central do requisito: encerrar as faixas de vídeo/áudio.
  // Esconder o <video> não libera o hardware — apenas o track.stop() libera.
  stream.getTracks().forEach((track) => {
    track.stop();
    console.log(`Track encerrado: ${track.kind} (${track.label})`);
  });

  stream = null;
  video.srcObject = null;

  video.classList.remove('ativa');
  avisoVideo.hidden = false;

  atualizarBotoes();
  mostrarMensagem('Câmera desligada e tracks encerrados (hardware liberado).', 'ok');
}

/* ---------------------- RF02 + RF03 + RF04 — Captura ----------------- */
function capturarImagem() {
  /* RF07 — captura sem câmera disponível */
  if (!stream) {
    mostrarMensagem('Ligue a câmera antes de capturar a imagem.', 'erro');
    return;
  }

  /* RF07 — câmera ainda inicializando */
  if (video.readyState < 2 || video.videoWidth === 0) {
    mostrarMensagem('A câmera ainda está inicializando. Aguarde um instante e tente novamente.', 'erro');
    return;
  }

  const largura = video.videoWidth;
  const altura  = video.videoHeight;

  // Ajusta o canvas à resolução real do vídeo (evita distorção)
  canvas.width  = largura;
  canvas.height = altura;

  /* ---------- RF03: efeito visual com context.filter ---------- */
  ctx.filter = selectEfeito.value;         // ex.: 'sepia(1)'
  ctx.drawImage(video, 0, 0, largura, altura);

  // ⚠️ Resetar o filtro ANTES de desenhar o texto,
  // senão a legenda também recebe o efeito (ficaria ilegível).
  ctx.filter = 'none';

  /* ---------- RF04: identificação + data/hora sobre a foto ---------- */
  const nome = inputNome.value.trim() || 'Aluno(a) não identificado(a)';

  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  desenharLegenda(nome, dataHora, largura, altura);

  /* ---------- RF05: exibição do resultado ---------- */
  canvas.classList.add('visivel');
  avisoCanvas.hidden = true;

  btnDownload.hidden = false;
  btnDownload.href = canvas.toDataURL('image/png');

  mostrarMensagem('Imagem capturada e processada com sucesso!', 'ok');
}

/**
 * Desenha a faixa inferior com nome e data/hora.
 * As medidas são proporcionais à largura da imagem para funcionar
 * tanto em 640x480 quanto em 1920x1080.
 */
function desenharLegenda(nome, dataHora, largura, altura) {
  const escala     = largura / 1280;
  const fonteNome  = Math.max(Math.round(34 * escala), 16);
  const fonteData  = Math.max(Math.round(22 * escala), 12);
  const margem     = Math.max(Math.round(24 * escala), 12);
  const espaco     = Math.round(8 * escala);

  const alturaBarra = margem + fonteNome + espaco + fonteData + margem;

  // Faixa semitransparente para garantir legibilidade sobre qualquer foto
  ctx.fillStyle = 'rgba(0, 0, 0, 0.60)';
  ctx.fillRect(0, altura - alturaBarra, largura, alturaBarra);

  // Linha de destaque no topo da faixa
  ctx.fillStyle = '#00e0a4';
  ctx.fillRect(0, altura - alturaBarra, largura, Math.max(Math.round(4 * escala), 2));

  ctx.textBaseline = 'top';
  ctx.textAlign    = 'left';

  // Nome do aluno
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fonteNome}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(nome, margem, altura - alturaBarra + margem);

  // Data e hora da captura
  ctx.fillStyle = '#bfeff0';
  ctx.font = `${fonteData}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(
    `Captura em: ${dataHora}`,
    margem,
    altura - alturaBarra + margem + fonteNome + espaco
  );
}

/* ----------------------------- Eventos ------------------------------ */
btnLigar.addEventListener('click', ligarCamera);
btnCapturar.addEventListener('click', capturarImagem);
btnDesligar.addEventListener('click', desligarCamera);

// Segurança extra: se a aba for fechada/recarregada, libera o hardware
window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
});

/* --------------------------- Inicialização --------------------------- */
atualizarBotoes();