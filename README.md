# Cartelería TV — publicidad en pantalla

Esta es la pantalla publicitaria que se abre desde el navegador del televisor.
Todo lo que hay en este repositorio se publica solo en GitHub Pages: **cualquier
cambio que hagas aquí aparece en la pantalla en unos minutos**.

## Cambiar la publicidad

### Sustituir un anuncio por otro

La forma más rápida, y no hace falta saber nada de programación:

1. Entra en la carpeta del anuncio que quieras cambiar:
   - [`anuncios/lateral/`](anuncios/lateral) — banda vertical de la izquierda
   - [`anuncios/inferior/`](anuncios/inferior) — banda horizontal de abajo
   - [`anuncios/completa/`](anuncios/completa) — pantalla completa
2. Pulsa **Add file → Upload files** y arrastra tu imagen.
3. Ponle **el mismo nombre** que el que sustituye (incluida la extensión).
4. Abajo, pulsa **Commit changes**.

En dos o tres minutos la pantalla lo recoge sola. Si tienes prisa, apaga y
enciende el televisor.

### Añadir un anuncio nuevo

Si en vez de sustituir quieres **añadir** uno más, hay un paso extra, porque la
lista de anuncios está escrita en un archivo:

1. Sube la imagen a su carpeta, como arriba, con el nombre que quieras.
2. Abre [`playlist.json`](playlist.json) y pulsa el **lápiz** para editarlo.
3. Añade una línea con tu archivo, copiando el formato de las que ya hay:

```json
{ "src": "anuncios/lateral/03-rebajas.jpg", "zona": "lateral" },
```

La `zona` dice en qué banda sale: `"lateral"`, `"inferior"`, o sin `zona` para
pantalla completa. Cuidado con las comas: todas las líneas llevan una al final
menos la última.

4. **Commit changes**.

### Quitar un anuncio

Borra su línea de `playlist.json`. El archivo puede quedarse donde está.

## Medidas de las imágenes

| Zona | Tamaño | Cómo es |
|---|---|---|
| Banda lateral | **422 × 864** | vertical, estrecha y alta |
| Banda inferior | **1920 × 216** | muy apaisada, como una franja |
| Pantalla completa | **1920 × 1080** | pantalla entera |

Valen JPG, PNG, WEBP y SVG. No hace falta que sean exactas: si la proporción no
coincide, el anuncio se ve entero con un margen, nunca recortado. Pero cuanto
más se acerquen, mejor queda.

El orden de la pantalla es el de `playlist.json`, de arriba abajo.

## Cambiar los tiempos o el vídeo

En [`config-fabrica.json`](config-fabrica.json), con el lápiz:

| Ajuste | Qué hace |
|---|---|
| `videoMarco` | Enlace del vídeo del recuadro |
| `marcoCadaSegundos` | Cada cuánto aparece la L |
| `marcoDuraSegundos` | Cuánto se queda |
| `marcoEfecto` | `fundido`, `apertura`, `deslizar`, `zoom` o `ninguno` |
| `duracionImagen` | Segundos por anuncio |

También se pueden cambiar desde la propia pantalla, pulsando **OK** sobre ella.

## Aviso

Este repositorio es **público**: las imágenes y los textos que subas aquí los
puede ver cualquiera en internet. No subas nada que no quieras enseñar.
