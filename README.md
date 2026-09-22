# Milla Cuántica · Entrega de desarrollo

Última versión del prototipo, 7 de septiembre de 2026. Incluye la intro, esfera transparente, pulsos convergentes, cámara, fichas, coordenadas de Bloch y audio. Conserva los últimos ajustes: pestañas y botón Explorar sin sonido, ficha más elevada y controles superiores más pequeños.

### Cambios sobre la entrega de Laura

- **Montaje con Vite** y paso de ocho scripts de ámbito global a módulos ES. Ver «De ámbito global a módulos».
- **El contador «X/5 explorados» ya acumula.** `resetExperience()` borraba el recorrido siempre, y lo llaman también la X, el clic fuera y Escape: cerrar una ficha te devolvía a 1/5. Ahora solo lo borran el botón de reinicio y la vuelta por inactividad, que son las dos veces que de verdad empieza otra persona.
- **Un solo aviso al seleccionar territorio.** Había dos `announce()` en el mismo tick; el primero lo pisaba el segundo y un lector de pantalla nunca llegaba a leerlo.
- **Arreglado el efecto de luz convergente**, que se había roto al pasar a módulos: a `card.js` le faltaba importar `R` y a `background.js`, `W` y `H`. `positionCard()` lanzaba dentro de `draw()` y mataba el bucle de animación en el primer fotograma tras abrir una ficha. El pulso libre seguía funcionando porque `emitWave()` llama a `draw()` directamente.
- **Fuera el pedestal.** Los anillos concéntricos bajo la esfera, sus cinco arcos giratorios y el halo del suelo (`drawPedestal`) ya no se dibujan. Competían con la esfera, que es el asunto, y tapaban la etiqueta `|1⟩` del eje z, que ahora se lee. La esfera se sostiene sola.
- **Menos brillo de fondo en las partículas**, de 0,11 a 0,075: en reposo la retícula no tiene por qué competir con el pulso, que es lo que sí debe destacar.
- **Rendimiento del bucle de dibujo**, sin tocar el aspecto. Medido con A/B interleaved en la misma sesión, tres pares por escenario: **3,73 → 3,20 ms en reposo (−14 %) y 4,50 → 3,63 ms con una ficha abierta (−19 %)**. Ver «Rendimiento».
- **Fuera el anillo de progreso de la intro.** Era un arco en el lienzo de radio `size * 1.32` —más de 250 px— que barría por detrás del núcleo y cruzaba por encima del texto «Mantén pulsado para comenzar». Sobraba: el propio botón ya se rellena con su `conic-gradient`, que es el indicador que hay que mirar.

## Arrancar

```sh
npm install
npm run dev        # http://localhost:5195
npm run build      # genera dist/
npm run preview    # sirve dist/ para comprobarlo
npm test           # build de pruebas + smoke test
npm run package    # build + ZIP para Netlify
```

## Tecnologías

- HTML5 semántico, CSS responsive y JavaScript nativo.
- Canvas 2D para dibujar la esfera, partículas, pulsos, coordenadas, base e intro. La geometría es 3D y se proyecta matemáticamente sobre el canvas.
- WebGL 1 y GLSL para el shader procedural del fondo. Tiene alternativa CSS si WebGL no está disponible.
- SVG integrado en HTML para iconos y conexión luminosa entre punto y tarjeta.
- Web Audio API para sintetizar efectos y música ambiental mediante osciladores, filtros y envolventes.
- Pointer Events, requestAnimationFrame, ResizeObserver y Fullscreen API.

No utiliza Three.js, Blender, React, backend, base de datos, servicios de IA en ejecución, fuentes remotas ni archivos de música. **En tiempo de ejecución no hay ninguna dependencia**: lo que se publica son un HTML, un CSS y un JS. Vite y jsdom son solo herramientas de desarrollo.

## Dónde editar

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Estructura, iconos SVG, accesibilidad, intro y controles |
| `src/styles.css` | Diseño, tamaños, responsive, resplandores y hover |
| `src/content.js` | `DATA`: textos, colores, iconos y pestañas de los cinco territorios |
| `src/dom.js` | `$`, `$$`, `icon` y `reduced`: lo único que comparten todos sin depender de nadie |
| `src/app.js` | Selección de territorio, navegación, tabs, cierre, modo exposición |
| `src/sphere.js` | Partículas, pulsos, luz convergente, giro, zoom y coordenadas |
| `src/card.js` | Posición de tarjeta y X flotante; trazado del enlace SVG |
| `src/audio.js` | Efectos, música procedural, silencio y estado del audio |
| `src/background.js` | Shader WebGL y actualización de sus uniforms |
| `src/intro.js` | Mantener pulsado, carga, explosión y entrada al universo |
| `src/main.js` | Inicialización final del conjunto |

### De ámbito global a módulos

La entrega original eran ocho scripts clásicos que compartían ámbito global y, en siete
sitios, **se escribían variables el uno al otro**. En módulos ES eso no se puede: lo que se
importa es una vista de solo lectura. Cada caso se ha resuelto dando la propiedad del dato
a quien lo usa y abriendo una puerta con nombre:

| Antes | Ahora |
| --- | --- |
| `app.js` declaraba `paused`, que solo leía y escribía `sphere.js` | vive en `sphere.js` |
| `card.js` y `main.js` reasignaban `rotationX` / `rotationY` | `setRotation(y, x)` y `turnBy(delta)` |
| `intro.js` hacía `waves = []` | `clearWaves()` |
| `app.js` ponía `draggedOutside = false` | `consumeDragOutside()`, que lee y limpia la marca |
| `main.js` hacía `backdrop = createBackdrop()` | `initBackdrop()` |
| `audio.js` escribía `chargeVoice` de `intro.js` | la voz y su `stopCharge()` viven en `audio.js`, que es de quien es el `audioContext` |

Los módulos forman un ciclo (`app ↔ sphere ↔ card`…) y es legal: **ninguno usa nada de otro
en su nivel superior**, solo dentro de funciones y manejadores. Lo único que se ejecuta al
importar son registros de listeners sobre elementos propios; el arranque sigue estando al
final, ahora en `main.js`.

## Rendimiento

El cuello es el hilo principal, no la GPU: el fondo WebGL va a 1100×520 y es barato, mientras
que `draw()` recorre 1.150 puntos treinta veces por segundo. Cuatro cambios, ninguno visible:

- **La ficha y las etiquetas solo se recolocan cuando la vista cambia.** `positionCard()`
  lee `getBoundingClientRect` y `offsetWidth` justo después de escribir estilos, o sea que
  forzaba dos reflujos de maquetación por fotograma, más 25 escrituras de estilo en los
  cinco puntos. Y con una ficha abierta la esfera está quieta: se estaba recalculando todo
  para dejarlo donde ya estaba. Ahora se compara la vista (`rotationX/Y`, `CX`, `CY`, `R`,
  territorio) y con una ficha abierta salen **0 recolocaciones en 90 fotogramas**. Quien
  cambia el contenido (`renderTab`) o el tamaño de ventana (`resize`) sigue llamando
  directo. Esto es lo que más pesa en una máquina lenta: la maquetación no va por GPU.
- **La proyección reutiliza sus objetos.** Antes `points.map(...)` creaba 1.150 objetos por
  dibujado —34.500 por segundo— solo para tirarlos. La geometría es fija; lo único que
  cambia es la proyección, así que se escribe sobre el mismo array y se ordena en el sitio.
- **La luz convergente calcula una vez lo que no depende del punto.** Las crestas activas de
  cada origen, su avance y su peso, la carga acumulada y el desvanecimiento de la selección
  anterior solo dependen del reloj, y estaban dentro del bucle de los 1.150 puntos dando
  siempre el mismo número. Ahora `prepareLight()` los calcula una vez por fotograma y
  `convergingLight` se queda con las dos distancias angulares que sí varían. Además descarta
  un origen entero cuando el punto queda fuera de su corredor, que es la mayoría de los casos.
- **Los colores se formatean redondeados.** El coste no era concatenar sino convertir
  flotantes largos («0.5234523452345235») y que el lienzo parseara esa cadena como CSS, 2.300
  veces por fotograma.

Se probó también **memoizar los colores en un Map**, y se descartó: los cuatro componentes
varían de forma continua, así que la cache crecía sin techo —164.000 entradas en 40 segundos
medidos— y esto va a estar días encendido en una pantalla de exposición. Ganaba lo mismo que
redondear, con una fuga de memoria de regalo.

Lo que queda y no se ha tocado: el halo elíptico por punto cuesta unos 0,7 ms de los 3,6, y
no se puede saltar sin que se note —incluso en los puntos más traseros su alfa es 0,17—. Y
las operaciones de lienzo en bruto son el suelo, unos 2,5 ms.

## Cómo funciona el efecto cascada

Todo el efecto está en `sphere.js`. Las 1.150 partículas se distribuyen sobre una esfera unitaria mediante una espiral de Fibonacci. `points` y sus elementos están congelados con `Object.freeze`: **la luz cambia; las partículas nunca se atraen ni se desplazan sobre la superficie**. Solo el giro y la cámara cambian su posición proyectada en pantalla.

Hay dos efectos que conviven:

1. **Pulso libre/original.** `emitWave()` guarda un origen y un instante. `draw()` ilumina las partículas que encuentra un frente expansivo según la distancia angular desde ese origen. Se usa en reposo y al tocar libremente la esfera.
2. **Selección de un territorio.** `selectLight(index)` establece como destino uno de los cinco `ANCHORS` y toma los otros cuatro como orígenes. `convergingLight(p)` calcula la intensidad de cada partícula para cada fotograma.

La distancia angular entre vectores unitarios es `acos(dot(a,b))`. Para cada origen se calcula:

```text
desvío = distancia(origen, partícula) + distancia(partícula, destino)
         - distancia(origen, destino)
corredor = exp(-(desvío / 0.22)²)
frente = tiempo_del_pulso × velocidad
cresta = exp(-((distancia(origen, partícula) - frente) / 0.105)²)
```

El corredor concentra la luz en el arco hacia el destino. Cada origen emite tres crestas consecutivas; sus tiempos están escalonados. Conforme llegan, se suma una iluminación localizada alrededor del punto seleccionado y se mantiene una respiración sinusoidal. Al cambiar de territorio, la iluminación anterior se desvanece y se generan nuevos recorridos. El resultado se limita a una intensidad máxima de 1 antes de dibujar brillo y halos.

Parámetros útiles, todos en `sphere.js`:

| Parámetro actual | Efecto al modificarlo |
| --- | --- |
| `N = 1150` | Densidad de partículas y coste de dibujo |
| `ANCHORS` | Posiciones de los cinco accesos sobre la esfera |
| `delay: i * .16` en `selectLight` | Desfase entre los cuatro orígenes |
| `speed = 1.05` | Velocidad angular de convergencia |
| `beat < 3`, `beat * .24` | Cantidad de crestas y separación temporal |
| `.22` en el corredor | Anchura de las rutas luminosas |
| `.105` en la cresta | Grosor de cada frente |
| `.48` en `nearby` | Radio angular de la iluminación acumulada |
| `elapsed * 1.2` en `breathe` | Velocidad de respiración de la luz |

`motionTime` controla el giro y el pulso libre. `elapsed` mantiene viva la luz; no unificar ambos relojes al modificar la pausa. Con movimiento reducido se muestra directamente una iluminación estable.

## Cámara, Bloch y fichas

`transform()` rota, `project()` aplica perspectiva y `cameraLayout()` ajusta centro y radio. `focusCamera()` acerca el territorio seleccionado y coloca la esfera a la izquierda en pantallas amplias. `unfocusCamera()` devuelve la vista general. `positionCard()` calcula la ubicación de la ficha y su conexión desde el mismo punto 3D; actualizarlo junto con la cámara si se cambia la composición.

La X vive fuera del área desplazable de la ficha, por lo que permanece visible. Se cierra también al hacer clic fuera o pulsar Escape. El gesto de arrastre de la esfera se diferencia del clic de cierre.

Los ejes de Bloch usan la conversión `(x_B, y_B, z_B) = (x, z, -y)` del motor: z une los polos |0⟩ y |1⟩, x e y forman el plano ecuatorial. Son una referencia visual de Bloch; los cinco accesos editoriales no representan estados cuánticos ni se simulan medidas físicas.

## Intro y audio

`beginHold()` inicia una carga de 1.800 ms. Soltar o perder el foco cancela la carga; completarla llama a `beginBirth()` y finalmente a `finishIntro()`. Hay entrada directa y soporte de teclado.

El navegador habilita Web Audio tras una interacción. El hover de la intro puede estar en silencio antes de que el usuario active el contexto; no es un fallo de recursos. El control de sonido silencia tanto música como efectos. Las tabs y el botón Explorar de la ficha permanecen sin sonido por decisión de diseño.

## Comprobar cambios

Pruebas opcionales, con Node.js 20 o posterior:

```sh
npm install
npm test
```

El smoke test comprueba intro, cancelación y carga completa, cinco territorios y sus tabs, geometría inmutable, convergencia, cambio de cámara, cierre, teclado, movimiento reducido y alternativa sin Canvas. Los tests simulan Canvas/WebGL y audio: **no sustituyen una revisión visual ni una escucha en navegador real**. Se han ejecutado sobre esta entrega.

Ahora corre sobre **lo que se publica**, no sobre las fuentes: `npm test` hace primero
`vite build --mode test` y el test inlinea ese bundle en jsdom. Dos detalles que hay que
respetar si se toca:

- jsdom no ejecuta módulos ES, así que el bundle se inlinea como script clásico. Se puede
  porque no queda en él ni un `import` ni un `export`. Y se coloca **al final del `<body>`**,
  porque Vite lo emite en el `<head>` —como módulo va diferido— y de otro modo se ejecutaría
  antes de que exista el DOM.
- El test conduce el motor por nombre (`tick`, `stepCamera`, `motionTime`, `lightTransition`…),
  cosa que antes le daba gratis el ámbito global. Ahora `sphere.js` e `intro.js` publican esa
  superficie **solo** con `--mode test`, y con accesores, no copiando valores, porque son
  números que cambian mientras el test conduce la escena. En el build de producción la
  condición es constante y el bloque desaparece del bundle.
- Esa superficie vive en `window.__engine`, no en globales sueltas, y el test abre las
  expresiones con `with (window.__engine)`. El motivo es concreto: en la primera versión
  colgaba de `window`, y eso hizo que un `import` olvidado en `card.js` se resolviera
  igualmente en el build de pruebas. El suite dio los tres escenarios por buenos y la app
  reventaba en producción.

**Lo que el suite no cubre.** Aun con eso, solo detecta identificadores libres en el código
que **ejecuta**. La variable que faltaba (`R`) vive en una rama de `positionCard()` que
jsdom no llega a recorrer, y quitarla de nuevo sigue pasando los tres escenarios —
comprobado—. Para cerrar esa clase de fallo del todo hace falta un linter con `no-undef`;
hoy no lo hay.

Para revisión manual: completar la intro con ratón y espacio, girar la esfera, seleccionar puntos delanteros y traseros, cambiar tabs, cerrar con X/clic exterior/Escape, activar silencio y revisar móvil y pantalla táctil. Verificar fluidez y nivel de audio en el dispositivo final de exposición.

## Exportar a Netlify

`dist/` es la web completa y lista para publicar: un HTML, un CSS y un JS, sin variables de entorno ni claves.

```sh
npm run package
```

Hace el build y genera `milla-cuantica-netlify.zip` en la raíz, con `index.html` arriba del todo. Súbelo a https://app.netlify.com/drop; alternativamente, arrastra la carpeta `dist/`. Documentación: https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/

En una integración con Git: comando de compilación `npm run build`, directorio de publicación `dist`.

## Alcance de la entrega

Los contenidos siguen siendo provisionales y necesitan validación del cliente, especialmente la oferta académica, directorios y entidades. El código usa HTML interpolado para datos locales: si se conecta a un CMS, habrá que validar/sanitizar ese contenido. No se incluyen PDFs, capturas o vídeos de referencia, ni se depende de ellos para ejecutar la web.

`ORIGEN.json` identifica mediante SHA-256 el HTML del que se extrajo esta entrega. El HTML autónomo original de Laura se conserva sin modificar; a partir de aquí, la fuente de trabajo es `src/`.
