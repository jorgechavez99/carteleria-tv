/*
 * Publicidad TV - motor de carteleria digital.
 *
 * Funciona en tres sitios sin cambios:
 *   - dentro del APK (hay puente nativo: window.PublicidadLocal)
 *   - en el navegador de cualquier Smart TV (sin puente, solo remoto + demo)
 *   - en un navegador de escritorio, para probar
 *
 * Dos modos de pantalla:
 *   - completa: un unico reproductor ocupando todo
 *   - marco:    un video en un recuadro y publicidad rotando en las bandas
 *               lateral e inferior (el formato en "L" de la television)
 */

'use strict';

// ---------------------------------------------------------------- utilidades

var puente = window.PublicidadLocal || null;   // lo inyecta la app Android
var EXT_VIDEO = ['mp4', 'webm', 'mkv', 'm4v', '3gp'];
var EXT_IMAGEN = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'];

function extension(ruta) {
  var limpio = String(ruta).split('?')[0].split('#')[0];
  var punto = limpio.lastIndexOf('.');
  return punto === -1 ? '' : limpio.slice(punto + 1).toLowerCase();
}

function tipoDe(item) {
  if (item.tipo) return item.tipo;
  var ext = extension(item.src);
  if (EXT_VIDEO.indexOf(ext) !== -1) return 'video';
  if (EXT_IMAGEN.indexOf(ext) !== -1) return 'imagen';
  return 'imagen';
}

function log(mensaje) {
  try { console.log('[publicidad] ' + mensaje); } catch (e) {}
}

function leerCache(clave) {
  try {
    var crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch (e) { return null; }
}

function guardarCache(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
}

// Mezcla de Fisher-Yates, para el modo aleatorio
function barajar(lista) {
  var copia = lista.slice();
  for (var i = copia.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = copia[i]; copia[i] = copia[j]; copia[j] = tmp;
  }
  return copia;
}

// ------------------------------------------------------------- configuracion

var CONFIG_POR_DEFECTO = {
  modo: 'completa',       // 'completa' | 'marco'
  videoMarco: '',         // stream HLS o video del recuadro (solo en modo marco)
  marcoPosicion: 'izquierda',
  marcoLateral: 22,       // ancho de la banda lateral, en % de la pantalla
  marcoInferior: 20,      // alto de la banda inferior, en %

  marcoCiclo: 'siempre',    // 'siempre' = la L no se va | 'intervalo' = va y viene
  marcoCadaSegundos: 120,   // cada cuanto asoma la L
  marcoDuraSegundos: 30,    // cuanto se queda antes de retirarse
  marcoEfecto: 'fundido',   // 'fundido' | 'apertura' | 'deslizar' | 'zoom' | 'ninguno'
  marcoVelocidad: 800,      // milisegundos que dura la entrada o la salida

  remoteUrl: '',          // URL de un playlist.json remoto
  fuente: 'ambos',        // 'ambos' | 'local' | 'remoto'
  duracionImagen: 8,      // segundos por imagen
  duracionMaxVideo: 0,    // 0 = reproducir el video entero
  refrescoMinutos: 15,    // cada cuanto se vuelve a leer la lista
  orden: 'secuencial',    // 'secuencial' | 'aleatorio'
  ajuste: 'contain',      // 'contain' = sin recortar | 'cover' = llena la pantalla
  ticker: '',             // texto corrido inferior ('' lo oculta)
  logo: ''                // URL de un logo de esquina ('' lo oculta)
};

// Lo que el usuario deja escrito en la pantalla de ajustes. Manda sobre el
// config.json, porque es lo ultimo que alguien decidio a proposito.
var CLAVE_AJUSTES = 'ajustes_publicidad';

var config = Object.assign({}, CONFIG_POR_DEFECTO);

function aplicarConfig(parcial) {
  if (!parcial || typeof parcial !== 'object') return;
  Object.keys(CONFIG_POR_DEFECTO).forEach(function (clave) {
    if (parcial[clave] !== undefined && parcial[clave] !== null && parcial[clave] !== '') {
      config[clave] = parcial[clave];
    }
  });
}

function ajustesGuardados() {
  return leerCache(CLAVE_AJUSTES) || {};
}

// -------------------------------------------------------- carga de la lista

// Normaliza lo que venga (array suelto o {items:[...]}) a una lista de items.
function normalizar(datos, origen) {
  var bruto = Array.isArray(datos) ? datos : (datos && datos.items) || [];
  if (datos && !Array.isArray(datos)) aplicarConfig(datos);

  return bruto
    .map(function (item) {
      if (typeof item === 'string') item = { src: item };
      if (!item || !item.src) return null;
      return {
        src: item.src,
        tipo: tipoDe(item),
        duracion: Number(item.duracion) > 0 ? Number(item.duracion) : null,
        ajuste: item.ajuste || null,
        zona: item.zona || null,      // 'lateral' | 'inferior' | null (todas)
        origen: origen,
        fallos: 0
      };
    })
    .filter(Boolean);
}

function cargarLocal() {
  if (!puente) return [];
  try {
    return normalizar(JSON.parse(puente.listarMedios() || '[]'), 'local');
  } catch (e) {
    log('no se pudo leer la carpeta local: ' + e);
    return [];
  }
}

function cargarConfigLocal() {
  if (!puente) return;
  try {
    var crudo = puente.leerConfig();
    if (crudo) aplicarConfig(JSON.parse(crudo));
  } catch (e) {
    log('config.json local invalido: ' + e);
  }
}

function cargarRemoto() {
  if (!config.remoteUrl) return Promise.resolve([]);

  // Evita que una respuesta cacheada por el TV congele la publicidad
  var url = config.remoteUrl + (config.remoteUrl.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();

  return fetch(url, { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (datos) {
      var items = normalizar(datos, 'remoto');
      items.forEach(function (item) {
        try { item.src = new URL(item.src, config.remoteUrl).href; } catch (e) {}
      });
      guardarCache('playlist_remota', items);
      return items;
    })
    .catch(function (e) {
      log('remoto no disponible (' + e.message + '), uso la ultima copia');
      return leerCache('playlist_remota') || [];
    });
}

/**
 * Como sale la app de fabrica. Se lee siempre, a diferencia del playlist de
 * ejemplo, que solo entra cuando no hay ningun anuncio todavia.
 */
function cargarConfigFabrica() {
  return fetch('config-fabrica.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (datos) { if (datos) aplicarConfig(datos); })
    .catch(function () { /* sin archivo se usan los valores del codigo */ });
}

function cargarDemo() {
  return fetch('playlist.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (datos) { return normalizar(datos, 'demo'); })
    .catch(function () { return []; });
}

function construirPlaylist() {
  // Precedencia, de menos a mas mandona: valores del codigo, configuracion
  // de fabrica del APK, config.json del dispositivo o del servidor, y por
  // encima de todo lo que alguien haya dejado escrito en los ajustes.
  config = Object.assign({}, CONFIG_POR_DEFECTO);

  return cargarConfigFabrica().then(function () {
    cargarConfigLocal();

    var locales = config.fuente === 'remoto' ? [] : cargarLocal();
    var pedirRemoto = config.fuente !== 'local';

    return (pedirRemoto ? cargarRemoto() : Promise.resolve([])).then(function (remotos) {
      aplicarConfig(ajustesGuardados());

      var lista = remotos.concat(locales);
      if (lista.length > 0) return lista;
      return cargarDemo().then(function (demo) {
        aplicarConfig(ajustesGuardados());   // la demo trae su propia config
        return demo;
      });
    });
  });
}

// --------------------------------------------------------------- reproductor

/** Rota una lista de anuncios dentro de un contenedor, con fundido. */
function Reproductor(contenedor, nombre) {
  this.contenedor = contenedor;
  this.nombre = nombre;
  this.capas = [this.crearCapa(), this.crearCapa()];
  this.activa = 0;
  this.items = [];
  this.indice = -1;
  this.temporizador = null;
  this.vigilante = null;
  this.pendiente = null;
  this.detenido = false;
}

Reproductor.prototype.crearCapa = function () {
  var capa = document.createElement('div');
  capa.className = 'capa';
  this.contenedor.appendChild(capa);
  return capa;
};

Reproductor.prototype.limpiarTemporizadores = function () {
  if (this.temporizador) { clearTimeout(this.temporizador); this.temporizador = null; }
  if (this.vigilante) { clearTimeout(this.vigilante); this.vigilante = null; }
};

/**
 * Entrega una lista nueva. Si [ya] es falso, espera a que acabe el anuncio
 * actual. [desplazamiento] hace que esta zona empiece por otro anuncio, para
 * que dos bandas no enseñen lo mismo a la vez.
 */
Reproductor.prototype.cargar = function (items, ya, desplazamiento) {
  var lista = config.orden === 'aleatorio' ? barajar(items) : items.slice();

  if (ya || this.items.length === 0) {
    this.items = lista;
    this.pendiente = null;
    // siguiente(1) sumara uno, asi que arrancamos justo antes del que toca
    this.indice = (desplazamiento || 0) - 1;
    this.siguiente(1);
  } else {
    this.pendiente = lista;
  }
};

Reproductor.prototype.utiles = function () {
  return this.items.filter(function (i) { return i.fallos < 3; });
};

Reproductor.prototype.siguiente = function (paso) {
  if (this.detenido) return;
  this.limpiarTemporizadores();

  if (this.pendiente) {
    this.items = this.pendiente;
    this.pendiente = null;
    this.indice = -1;
  }

  var utiles = this.utiles();
  if (utiles.length === 0) {
    // Reintenta por si vuelve la red o aparecen archivos nuevos
    var yo = this;
    this.temporizador = setTimeout(function () { refrescar(true); }, 60000);
    return;
  }

  this.indice = (this.indice + (paso || 1) + utiles.length * 2) % utiles.length;
  this.reproducir(utiles[this.indice]);
};

Reproductor.prototype.reproducir = function (item) {
  var yo = this;
  var capa = this.capas[1 - this.activa];
  capa.innerHTML = '';

  var avanzado = false;
  function avanzar() {
    if (avanzado) return;    // un video puede disparar ended y el tope a la vez
    avanzado = true;
    yo.siguiente(1);
  }
  function fallo(motivo) {
    item.fallos++;
    log('fallo "' + item.src + '" (' + motivo + '), intento ' + item.fallos);
    avanzar();
  }

  if (item.tipo === 'video') {
    var video = document.createElement('video');
    video.src = item.src;
    video.autoplay = true;
    video.muted = true;          // sin esto muchos TVs bloquean el autoplay
    video.playsInline = true;
    video.controls = false;
    if (item.ajuste) video.className = item.ajuste;

    video.addEventListener('ended', avanzar);
    video.addEventListener('error', function () { fallo('error de video'); });
    video.addEventListener('loadeddata', function () {
      yo.intercambiar(capa);
      var tope = item.duracion || config.duracionMaxVideo;
      if (tope > 0) yo.temporizador = setTimeout(avanzar, tope * 1000);
    });

    capa.appendChild(video);
    video.play().catch(function () { /* algunos TVs lo permiten igual */ });

    this.vigilante = setTimeout(function () {
      if (video.readyState < 2) fallo('no cargo a tiempo');
    }, 20000);

  } else {
    var img = new Image();
    if (item.ajuste) img.className = item.ajuste;
    img.alt = '';

    img.onload = function () {
      capa.appendChild(img);
      yo.intercambiar(capa);
      var segundos = item.duracion || config.duracionImagen;
      yo.temporizador = setTimeout(avanzar, segundos * 1000);
    };
    img.onerror = function () { fallo('error de imagen'); };
    img.src = item.src;

    this.vigilante = setTimeout(function () {
      if (!img.complete) fallo('no cargo a tiempo');
    }, 20000);
  }

  this.precargarSiguiente();
};

Reproductor.prototype.intercambiar = function (capaNueva) {
  var yo = this;
  if (this.vigilante) { clearTimeout(this.vigilante); this.vigilante = null; }

  this.capas[this.activa].classList.remove('visible');
  capaNueva.classList.add('visible');
  this.activa = 1 - this.activa;

  // Libera el anuncio anterior cuando termina el fundido
  setTimeout(function () { yo.capas[1 - yo.activa].innerHTML = ''; }, 700);
};

Reproductor.prototype.precargarSiguiente = function () {
  var utiles = this.utiles();
  if (utiles.length < 2) return;
  var proximo = utiles[(this.indice + 1) % utiles.length];
  if (proximo && proximo.tipo === 'imagen') {
    var pre = new Image();
    pre.src = proximo.src;
  }
};

Reproductor.prototype.detener = function () {
  this.detenido = true;
  this.limpiarTemporizadores();
  this.capas.forEach(function (c) { c.remove(); });
};

// ------------------------------------------------------ zonas segun el modo

var reproductores = [];
var ultimaCarga = null;

function zonasDelModo() {
  if (config.modo === 'marco') {
    return [
      { nombre: 'lateral', elemento: document.getElementById('zonaLateral') },
      { nombre: 'inferior', elemento: document.getElementById('zonaInferior') }
    ];
  }
  return [{ nombre: 'principal', elemento: document.getElementById('zonaPrincipal') }];
}

/**
 * Reparte los anuncios. Un anuncio puede pedir su zona ("lateral" o
 * "inferior"); los que no piden ninguna valen para cualquiera. Si una banda
 * se quedaria vacia, se le dan los genericos antes que dejarla en negro.
 */
function itemsDeZona(todos, nombreZona) {
  var propios = todos.filter(function (i) { return i.zona === nombreZona; });
  if (propios.length > 0) return propios;

  var genericos = todos.filter(function (i) { return !i.zona; });
  return genericos.length > 0 ? genericos : todos;
}

function reconstruirZonas() {
  reproductores.forEach(function (r) { r.detener(); });
  reproductores = [];

  var enMarco = config.modo === 'marco';
  document.getElementById('marco').classList.toggle('oculto', !enMarco);
  document.getElementById('zonaPrincipal').classList.toggle('oculto', enMarco);

  zonasDelModo().forEach(function (zona) {
    reproductores.push(new Reproductor(zona.elemento, zona.nombre));
  });
}

function repartir(items, ya) {
  reproductores.forEach(function (r, posicion) {
    r.cargar(itemsDeZona(items, r.nombre), ya, posicion);
  });

  if (items.length === 0) {
    mostrarVacio('No hay anuncios en la carpeta local ni en el servidor remoto.');
  } else {
    document.getElementById('vacio').classList.add('oculto');
  }
}

/** Cartel a pantalla completa cuando no hay nada que reproducir. */
function mostrarVacio(detalle) {
  document.getElementById('vacioDetalle').textContent = detalle;
  document.getElementById('vacio').classList.remove('oculto');
}

// ----------------------------------------------------- video del recuadro

var reintentoVideo = null;

/** Identificador del video si el enlace es de YouTube, o null si no lo es. */
function idYouTube(enlace) {
  var direccion;
  try {
    direccion = new URL(enlace);
  } catch (e) {
    return null;
  }

  var host = direccion.hostname.replace(/^www\.|^m\./, '');

  if (host === 'youtu.be') {
    return direccion.pathname.slice(1).split('/')[0] || null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') {
    return null;
  }
  if (direccion.pathname === '/watch') {
    return direccion.searchParams.get('v');
  }
  // /embed/ID, /live/ID, /shorts/ID, /v/ID
  var partes = direccion.pathname.split('/').filter(Boolean);
  if (partes.length >= 2 && ['embed', 'live', 'shorts', 'v'].indexOf(partes[0]) !== -1) {
    return partes[1];
  }
  return null;
}

/** Segundo de inicio: admite t=4321, t=4321s y t=1h12m1s */
function segundosDeInicio(enlace) {
  var crudo;
  try {
    var direccion = new URL(enlace);
    crudo = direccion.searchParams.get('t') || direccion.searchParams.get('start');
  } catch (e) {
    return 0;
  }
  if (!crudo) return 0;

  if (/^\d+$/.test(crudo)) return Number(crudo);

  var trozos = crudo.match(/(\d+)h|(\d+)m|(\d+)s/g) || [];
  var total = 0;
  trozos.forEach(function (trozo) {
    var numero = parseInt(trozo, 10);
    if (trozo.endsWith('h')) total += numero * 3600;
    else if (trozo.endsWith('m')) total += numero * 60;
    else total += numero;
  });
  return total;
}

/** URL del reproductor incrustado de YouTube, preparado para una cartelera. */
function enlaceIncrustadoYouTube(enlace, id) {
  var parametros = [
    'autoplay=1',
    'mute=1',          // sin silencio ningun navegador arranca solo
    'controls=0',
    'disablekb=1',
    'fs=0',
    'rel=0',
    'playsinline=1',
    'modestbranding=1',
    'iv_load_policy=3',   // sin anotaciones
    'cc_load_policy=0',   // sin subtitulos automaticos encima del video
    'loop=1',
    'playlist=' + id   // sin esto el loop no funciona en un video suelto
  ];

  var inicio = segundosDeInicio(enlace);
  if (inicio > 0) parametros.push('start=' + inicio);

  return 'https://www.youtube.com/embed/' + id + '?' + parametros.join('&');
}

function mostrarAvisoVideo(texto) {
  var aviso = document.getElementById('avisoVideo');
  aviso.textContent = texto;
  aviso.classList.remove('oculto');
}

function configurarVideoMarco() {
  var hueco = document.getElementById('reproductorMarco');
  var aviso = document.getElementById('avisoVideo');

  if (reintentoVideo) { clearTimeout(reintentoVideo); reintentoVideo = null; }

  hueco.innerHTML = '';
  aviso.classList.add('oculto');

  if (config.modo !== 'marco') return;

  if (!config.videoMarco) {
    mostrarAvisoVideo('Falta el enlace del video. Pulsa OK y entra en los ajustes.');
    return;
  }

  var id = idYouTube(config.videoMarco);

  if (id) {
    // YouTube no sirve el archivo de video, asi que va su propio reproductor
    var marco = document.createElement('iframe');
    marco.src = enlaceIncrustadoYouTube(config.videoMarco, id);
    marco.allow = 'autoplay; encrypted-media; picture-in-picture';
    marco.setAttribute('frameborder', '0');
    marco.setAttribute('allowfullscreen', '');
    marco.title = 'Video del recuadro';
    hueco.appendChild(marco);
    return;
  }

  var video = document.createElement('video');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.controls = false;
  video.loop = true;        // para un archivo; en un directo no estorba
  video.src = config.videoMarco;

  video.onerror = function () {
    mostrarAvisoVideo('No se pudo reproducir el video. Reintentando...');
    reintentoVideo = setTimeout(configurarVideoMarco, 10000);
  };
  video.onplaying = function () { aviso.classList.add('oculto'); };

  hueco.appendChild(video);
  video.play().catch(function () { /* el TV puede permitirlo igual */ });
}

// ------------------------------------------- aparicion y retirada de la L

var relojAparicion = null;
var relojRetirada = null;
var lDesplegada = false;
var proximoCambio = null;   // cuando toca el siguiente movimiento, para el panel

function elementoMarco() { return document.getElementById('marco'); }

/** Saca la L: el video se encoge al recuadro y entran las bandas. */
function desplegarL() {
  lDesplegada = true;
  elementoMarco().classList.remove('replegado');

  // Al asomar, cada banda estrena anuncio: si no, el espectador pilla uno
  // a medias y la mitad de las veces el mismo de la vez anterior.
  reproductores.forEach(function (r) { r.siguiente(1); });
}

/** Recoge la L: las bandas se van y el video vuelve a pantalla completa. */
function replegarL() {
  lDesplegada = false;
  elementoMarco().classList.add('replegado');
}

function pararRelojes() {
  if (relojAparicion) { clearInterval(relojAparicion); relojAparicion = null; }
  if (relojRetirada) { clearTimeout(relojRetirada); relojRetirada = null; }
}

/**
 * Pone en marcha el ir y venir de la L. Con el ciclo en "siempre" se queda
 * puesta y no hay temporizador que valga.
 */
function iniciarCicloMarco() {
  pararRelojes();
  proximoCambio = null;

  if (config.modo !== 'marco') return;

  if (config.marcoCiclo !== 'intervalo') {
    desplegarL();
    return;
  }

  var cada = Math.max(5, Number(config.marcoCadaSegundos) || 120);
  var dura = Math.max(2, Number(config.marcoDuraSegundos) || 30);

  // Si la L durase mas que el propio ciclo nunca llegaria a irse
  if (dura >= cada) dura = Math.max(2, cada - 2);

  function asomar() {
    desplegarL();
    proximoCambio = Date.now() + dura * 1000;
    relojRetirada = setTimeout(function () {
      replegarL();
      proximoCambio = Date.now() + (cada - dura) * 1000;
    }, dura * 1000);
  }

  // Arranca recogida: primero se ve el video limpio, y la L entra al rato
  replegarL();
  proximoCambio = Date.now() + cada * 1000;
  relojAparicion = setInterval(asomar, cada * 1000);
}

// ------------------------------------------------------------------ refresco

function refrescar(reiniciarYa) {
  return construirPlaylist().then(function (items) {
    ultimaCarga = new Date();
    aplicarAjustesVisuales();

    if (reiniciarYa) {
      reconstruirZonas();
      configurarVideoMarco();
    }
    repartir(items, reiniciarYa || reproductores.every(function (r) {
      return r.items.length === 0;
    }));
    // El ciclo se rearma despues de repartir: al asomar, la L hace avanzar
    // los reproductores, y para eso tienen que existir ya
    if (reiniciarYa) iniciarCicloMarco();
    return items;
  });
}

function aplicarAjustesVisuales() {
  document.body.classList.toggle('ajuste-cover', config.ajuste === 'cover');

  var raiz = document.documentElement.style;
  raiz.setProperty('--banda-lateral', Number(config.marcoLateral) + '%');
  raiz.setProperty('--banda-inferior', Number(config.marcoInferior) + '%');
  raiz.setProperty('--velocidad', Math.max(0, Number(config.marcoVelocidad)) + 'ms');

  var marco = document.getElementById('marco');
  marco.dataset.posicion = config.marcoPosicion;
  marco.dataset.efecto = config.marcoEfecto;

  // En modo marco la banda inferior ya es publicidad: el ticker la taparia
  var ticker = document.getElementById('ticker');
  if (config.ticker && config.modo !== 'marco') {
    document.getElementById('tickerTexto').textContent = config.ticker;
    ticker.classList.remove('oculto');
  } else {
    ticker.classList.add('oculto');
  }

  var logo = document.getElementById('logo');
  if (config.logo) {
    logo.src = config.logo;
    logo.classList.remove('oculto');
  } else {
    logo.classList.add('oculto');
  }
}

// ------------------------------------------------------- panel de diagnostico

function panelAbierto() { return !document.getElementById('panel').classList.contains('oculto'); }
function ajustesAbiertos() { return !document.getElementById('ajustes').classList.contains('oculto'); }

function abrirPanel() {
  var todos = reproductores.reduce(function (acum, r) { return acum.concat(r.items); }, []);
  var unicos = {};
  todos.forEach(function (i) { unicos[i.src] = i; });
  var lista = Object.keys(unicos).map(function (k) { return unicos[k]; });

  var cuenta = function (origen) {
    return lista.filter(function (i) { return i.origen === origen; }).length;
  };

  var filas = [
    ['Modo', config.modo === 'marco' ? 'Marco con video' : 'Pantalla completa']
  ];

  if (config.modo === 'marco') {
    var aparicion = config.marcoCiclo === 'intervalo'
      ? 'cada ' + config.marcoCadaSegundos + ' s, durante ' + config.marcoDuraSegundos + ' s'
      : 'siempre visible';
    filas.push(['Aparicion de la L', aparicion]);
    filas.push(['Efecto', config.marcoEfecto + ' (' + config.marcoVelocidad + ' ms)']);
    filas.push(['Ahora mismo', lDesplegada ? 'L visible' : 'video a pantalla completa']);

    if (proximoCambio) {
      var restan = Math.max(0, Math.round((proximoCambio - Date.now()) / 1000));
      filas.push([lDesplegada ? 'Se retira en' : 'Vuelve en', restan + ' s']);
    }
  }

  filas = filas.concat([
    ['Anuncios distintos', String(lista.length)],
    ['De la carpeta local', String(cuenta('local'))],
    ['Del servidor remoto', String(cuenta('remoto'))],
    ['Con error', String(lista.filter(function (i) { return i.fallos >= 3; }).length)],
    ['Carpeta local', puente ? (puente.rutaMedios() || 'no encontrada') : 'solo en el APK'],
    ['Video del recuadro', config.videoMarco || 'sin configurar'],
    ['Servidor remoto', config.remoteUrl || 'sin configurar'],
    ['Ultima actualizacion', ultimaCarga ? ultimaCarga.toLocaleString('es') : '-'],
    ['Refresco', config.refrescoMinutos + ' min'],
    ['Version app', puente ? puente.version() : 'navegador']
  ]);

  document.getElementById('panelDatos').innerHTML = filas.map(function (f) {
    return '<dt>' + f[0] + '</dt><dd>' + f[1] + '</dd>';
  }).join('');

  // Elegir carpeta solo tiene sentido dentro del APK
  var elegida = !!(puente && puente.carpetaElegida && puente.carpetaElegida());
  document.getElementById('btnCarpeta').classList.toggle('oculto', !puente);
  document.getElementById('btnOlvidarCarpeta').classList.toggle('oculto', !elegida);

  document.getElementById('panel').classList.remove('oculto');

  // El foco se da en el siguiente ciclo: si lo hicieramos ahora, el mismo
  // OK que abre el panel activaria el boton recien enfocado y entrariamos
  // en los ajustes de un solo golpe.
  setTimeout(function () { document.getElementById('btnAjustes').focus(); }, 0);
}

function cerrarTodo() {
  document.getElementById('panel').classList.add('oculto');
  document.getElementById('ajustes').classList.add('oculto');
}

// La llama la app Android cuando se pulsa Atras: si habia algo abierto lo
// cierra y devuelve true, y asi el boton no cierra la aplicacion entera.
window.cerrarPanel = function () {
  if (ajustesAbiertos()) {
    document.getElementById('ajustes').classList.add('oculto');
    abrirPanel();
    return true;
  }
  if (panelAbierto()) {
    cerrarTodo();
    return true;
  }
  return false;
};

// ------------------------------------------------------- pantalla de ajustes

var formulario = document.getElementById('formAjustes');

function abrirAjustes() {
  document.getElementById('panel').classList.add('oculto');

  var guardados = ajustesGuardados();
  Object.keys(CONFIG_POR_DEFECTO).forEach(function (clave) {
    var campo = formulario.elements[clave];
    if (!campo) return;
    // Muestra lo que el usuario guardo; si no guardo nada, lo que este activo
    campo.value = guardados[clave] !== undefined ? guardados[clave] : config[clave];
  });

  document.getElementById('ajustes').classList.remove('oculto');
  var primero = formulario.elements['modo'];
  if (primero) primero.focus();
}

formulario.addEventListener('submit', function (evento) {
  evento.preventDefault();

  var nuevos = {};
  Object.keys(CONFIG_POR_DEFECTO).forEach(function (clave) {
    var campo = formulario.elements[clave];
    if (!campo) return;
    var valor = campo.value.trim();
    if (valor === '') return;                    // vacio = no fijar nada
    if (typeof CONFIG_POR_DEFECTO[clave] === 'number') {
      var numero = Number(valor);
      if (!isNaN(numero)) nuevos[clave] = numero;
    } else {
      nuevos[clave] = valor;
    }
  });

  guardarCache(CLAVE_AJUSTES, nuevos);

  var aviso = document.getElementById('avisoAjustes');
  aviso.textContent = 'Guardado. Aplicando...';
  aviso.classList.add('guardado');

  refrescar(true).then(function () {
    cerrarTodo();
    aviso.classList.remove('guardado');
    aviso.textContent = 'Estos ajustes se guardan en el dispositivo y mandan sobre el config.json.';
  });
});

document.getElementById('btnAjustes').addEventListener('click', abrirAjustes);

document.getElementById('btnCarpeta').addEventListener('click', function () {
  if (puente && puente.elegirCarpeta) puente.elegirCarpeta();
});

document.getElementById('btnOlvidarCarpeta').addEventListener('click', function () {
  if (puente && puente.olvidarCarpeta) {
    puente.olvidarCarpeta();
    location.reload();
  }
});

// La llama la app si el aparato no tiene selector de archivos
window.avisarSinSelector = function () {
  mostrarVacio('Este aparato no trae selector de carpetas. Copia los anuncios a la carpeta Publicidad de la memoria interna.');
};

document.getElementById('btnCerrarAjustes').addEventListener('click', function () {
  document.getElementById('ajustes').classList.add('oculto');
  abrirPanel();
});

document.getElementById('btnRestablecer').addEventListener('click', function () {
  try { localStorage.removeItem(CLAVE_AJUSTES); } catch (e) {}
  refrescar(true).then(function () {
    cerrarTodo();
  });
});

// ------------------------------------------------------- control por teclado

document.addEventListener('keydown', function (e) {
  // Con los ajustes abiertos, las flechas sirven para moverse por el
  // formulario: el televisor ya se encarga, nosotros no tocamos nada.
  if (ajustesAbiertos()) {
    if (e.key === 'Escape') window.cerrarPanel();
    return;
  }

  if (panelAbierto()) {
    if (e.key === 'Escape' || e.key === 'Backspace') window.cerrarPanel();
    return;
  }

  switch (e.key) {
    case 'Enter':
      // Sin esto el navegador seguiria procesando la pulsacion sobre lo que
      // quede enfocado despues de abrir el panel
      e.preventDefault();
      abrirPanel();
      break;
    case 'Escape':
    case 'Backspace':
      window.cerrarPanel();
      break;
    case 'ArrowRight':
      reproductores.forEach(function (r) { r.siguiente(1); });
      break;
    case 'ArrowLeft':
      reproductores.forEach(function (r) { r.siguiente(-1); });
      break;
  }
});

// -------------------------------------------------------------------- arranque

// Evita que el TV apague la pantalla por inactividad (navegadores compatibles)
function mantenerDespierto() {
  if (!navigator.wakeLock) return;
  navigator.wakeLock.request('screen').catch(function () {});
}

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') mantenerDespierto();
});

mantenerDespierto();

refrescar(true).then(function () {
  // Relee la lista cada X minutos para recoger cambios sin reiniciar la TV
  setInterval(function () {
    if (!ajustesAbiertos()) refrescar(false);
  }, Math.max(1, config.refrescoMinutos) * 60000);
});
