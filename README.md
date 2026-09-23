# Ingeniería cuántica para la industria · Fusión de las dos propuestas

> El cliente fijó el nombre el 23/09/2026: la web se llama **«Ingeniería cuántica para la
> industria»**, no «Milla Cuántica». El repositorio, la carpeta y el paquete conservan el
> nombre de trabajo `milla-campo` (viene de fusionar `milla-cuantica` con `campo-cubits`).

Copia de trabajo acordada con el cliente (22/09/2026): `milla-cuantica` es el primer nivel
y, al pulsar un territorio, **la esfera se transforma en el campo de cúbits** de
`campo-cubits`, que pasa a ser el segundo nivel. Los proyectos originales se conservan
intactos. Arranca en http://localhost:5197 (`npm run dev`).

## La transformación

Los dos niveles viven **en el mismo lienzo**. `campo-cubits` estaba hecho en Three.js y
milla en Canvas 2D; para que la esfera se transforme de verdad —que cada punto viaje a su
sitio en el chip— el campo se ha traído al motor de milla, no al revés: rehacer milla en
Three.js habría sido reescribir justo la parte que eligió el cliente. La topología
heavy-hex del IBM Heron está en `src/field.js` y es la misma; lo que cambia es el tamaño de
la oblea, para que quepan en ella todos los puntos de la esfera (ver abajo). `core` marca
dónde caen los 156 cúbits de la máquina real, por si hiciera falta señalarlos.

- **Cada punto de la esfera es un cúbit, y no se disuelve ninguno.** Los 1.150 puntos
  viajan y se colocan en la retícula: la transformación es una sola materia que se
  recoloca, no una cosa que se va y otra que aparece. Para que quepan todos, la retícula es
  mucho mayor que un Heron —22 filas × 42 columnas con sus puentes, 1.145 nodos, 1.344
  acopladores— y los 5 puntos que aun así sobran son motas en los extremos de la primera y
  la última fila. Sigue siendo la misma retícula heavy-hex y sus mismas reglas; lo que crece
  es la oblea, que ahora sigue más allá del encuadre. La escala baja de 0,14 a 0,05 para que
  la oblea entera mida como el diámetro de la esfera —si no, al desplegarse se saldría de la
  pantalla— y la distancia de la cámara va en columnas, así que el encuadre final no cambia.
- **El reparto es un desenrollado, no una búsqueda del punto más cercano.** Los puntos se
  ordenan por latitud y se reparten banda a banda —fila, puentes, fila…— y dentro de cada
  banda por longitud, columna a columna. Así la esfera se abre anillo a anillo y ninguna
  trayectoria se cruza con otra; buscando el más cercano, los últimos nodos se quedaban con
  puntos del otro lado de la esfera y el vuelo salía enmarañado. **El sentido importa**: en
  este motor la `y` positiva se dibuja hacia abajo (|0⟩ es `y = −1` y va arriba) y la fila 0
  del chip cae arriba en pantalla, así que la latitud se ordena de forma ascendente. Al
  revés, el casquete de abajo se iba a la fila del fondo y las dos mitades de la esfera se
  cruzaban por el medio.
- **Las secciones guardan margen con el borde de la oblea.** Con la cámara metida en el
  territorio se ven unas tres columnas a cada lado y unas cinco filas hacia el fondo; una
  sección pegada al canto dejaba media pantalla de vacío. Que el cúbit elegido no sea
  exactamente el del ancla no se nota, porque el chip se ancla igualmente para que la
  sección nazca donde acaba de converger la luz.
- **Primero la luz.** Al pulsar se deja arrancar la luz convergente —el gesto propio de
  milla— antes de desplegar, y cada territorio nace en el cúbit **cuyo punto está más cerca
  de su ancla**: la sección aparece justo donde acaba de converger la luz.
- **La esfera no gira al elegir.** Antes la cámara la giraba para traer el punto al frente
  —venía de cuando había una ficha al lado—, y al elegir un territorio de la cara de atrás
  ese giro se llevaba consigo la malla a medio formar: los puntos salían rotando en vez de
  expandiéndose. Ahora la esfera se queda quieta y solo se abre; el acercamiento sí se
  conserva.
- **El chip nace del punto pulsado.** Al empezar, se ancla para que la sección caiga
  exactamente donde estaba su punto en la esfera. Sin eso la sección saltaba a un lado y el
  racimo de luz se quedaba solo en medio.
- **Después entra la cámara** hasta el encuadre oblicuo de `campo-cubits` (ver abajo).
- La interpolación va **en espacio de cámara**: la esfera conserva su giro y el chip su
  propia cámara, sin pelearse por `rotationX/Y`.

## El segundo nivel, como campo-cubits

**Encuadre final** (`FIELD_VIEW` en `sphere.js`): cámara girada 0,44 rad, picado de 0,48 rad
y muy cerca. La sección queda grande abajo a la izquierda con su anillo, el puente sube a la
derecha y la fila de pestañas se aleja en diagonal con sus nombres encima. El punto de mira
(`AIM_ALONG`, `AIM_SIDE` en `field.js`) cae casi en la fila de las hijas. Es una **cámara de
verdad**, con distancia y perspectiva, no un zoom de la imagen: arranca en la de la esfera
(`FIELD_START`, a 3,8 con el picado de campo) y giro, picado y distancia se interpolan con
la entrada; la distancia de forma geométrica.

**Dos capas al dibujar.** La oblea son 1.150 cúbits y 1.344 acopladores, y casi todos caen
lejos y apagados: dibujarlos uno a uno costaba más que todo lo demás junto. Lo pequeño y
apagado va en **trazo de grupo** —un solo camino por color para los puntos y otro para los
hilos de los acopladores—, y lo cercano y lo encendido, que es lo que se mira, conserva su
tratamiento completo, su recorte contra las esferas y su orden por profundidad. Lo que queda
fuera del encuadre se descarta **antes** de calcular su aspecto. Medido: el fotograma sigue
en p95 ≈ 14 ms con toda la oblea en pantalla, igual que con 156 cúbits.

**Aspecto** (`drawField`), con los tamaños de `campo-cubits` pasados a esta escala: esferas
con volumen (color plano más un sombreado común pintado una vez), acopladores como barras
con grosor y perspectiva, anillo tumbado en el plano del chip alrededor de la sección
abierta y halos aditivos en lo encendido, que hacen de bloom. Esferas y barras se ordenan
juntas por profundidad y las barras se recortan a la superficie de cada esfera, para que con
la cámara tan baja lo de delante tape de verdad a lo de detrás. En reposo los cúbits están
apagados y, al entrar la cámara, lo que no es el territorio abierto cede, como `REST_DIM` en
campo. Se mantienen los **colores de cada territorio** de milla (los de la luz convergente),
no el acento único de campo.

**Arrastrar para orbitar**, como `OrbitControls` en campo: en el chip, arrastrar en
horizontal gira alrededor del territorio y en vertical cambia el picado (limitado entre
casi cenital y casi a ras); la rueda acerca y aleja; las flechas del teclado también
orbitan. La cámara sigue al dedo con amortiguado. Arrastrar no cuenta como pulsar en vacío,
así que no devuelve a la esfera. En pantalla táctil el lienzo del chip usa
`touch-action: none` para que el arrastre vertical no se lo quede el desplazamiento de la
página. Pulsar en el menú el territorio ya abierto recoloca la cámara; abrir otro también.

**Cómo se ve encendido.** En `campo-cubits` el cúbit no es una esfera sombreada: es un
material **sin luz** —un disco de color plano— y lo que lo hace orgánico son otras dos capas
encima. Aquí se hace igual, porque intentar sombrear la esfera en Canvas 2D —un brillo
especular arriba a la izquierda y el borde oscuro— los volvía de plástico y nada tenía que
ver con el original.

- **Halos.** Cada cúbit lleva detrás un degradado aditivo en su tono (la capa de halos del
  original). Casi nada en reposo; lo levantan el encendido del menú, la medida, el destello
  de la lectura y el puntero. Es lo que hace que lo apagado se vea luminoso.
- **Bloom** (`drawBloom`). Lo que pasa de cierto brillo —cúbits encendidos y acopladores del
  camino— se vuelve a pintar en un lienzo a **un cuarto de resolución**, con el borde suave
  (un degradado, no un disco duro: al desenfocarlo, un disco duro deja canto y el halo se ve
  pegado), y se suma encima desenfocado a **tres escalas**. El reparto importa tanto como el
  desenfoque: **poco brillo cerca del núcleo y un ambiente muy ancho**, que es como se ve el
  del original —un baño de luz, no un halo caliente—. La escala ancha se desenfoca en un
  lienzo a un octavo, porque desenfocar cien píxeles sobre el lienzo grande cuesta y ahí sale
  igual por mucho menos. Usa el filtro del contexto cuando existe y, si no, encadena
  reducciones.
- Los encendidos van **pálidos**, casi blancos, y el tono queda en el halo, como con el mapeo
  de tonos del original; saturados se veían de neón y no de luz. Del disco solo queda un apagado muy leve hacia el borde, para que a
  tamaño grande no se lea como una pegatina, y en lo que brilla ni eso: un borde oscuro
  alrededor de algo encendido se lee como un agujero.
- En reposo el cúbit coge además un punto del tono del territorio abierto, porque allí el
  chip entero se baña del acento.

**El chip está vivo** (`src/circuit.js`, portado de `campo-cubits`). Un circuito corre sobre
la retícula mientras nadie lo toca:

- Avanza por **capas**, que el rótulo de abajo a la izquierda va contando (`Capa 4/10 · CZ`).
  Las capas no se pintan: encender sus puertas hacía parpadear el chip entero y en un menú
  eso cansa. El circuito se cuenta, no se destella.
- Lo que sí se ve es la **medida**: un frente de lectura cruza el chip de lado a lado, da un
  destello a cada cúbit al pasarle por encima y lo deja en |0⟩ —apagado— o en |1⟩ —encendido
  en el color del territorio abierto—. El patrón se queda un rato a la vista y se desvanece;
  después, otro circuito.
- La medida **se aparta del menú**: se atenúa mientras hay un territorio abierto y no toca su
  camino encendido, o el recorrido de la luz se perdería entre el ruido de fondo.
- No corre con movimiento reducido, con la escena pausada ni en la esfera.

**Señalar** (hover), también como en el original: un cúbit señalado crece, se eleva y dice su
nombre (`Q·084 · |1⟩`, con el bit si está medido); señalar una **sección** —su bola, su
entrada del menú lateral o con el tabulador— **adelanta su subnivel** encendiendo su camino
sin abrirlo; y señalar una pestaña señala su cúbit. Cada territorio tiene su propio reloj de
luz, así que el adelanto viaja desde su sección aunque haya otro abierto.

- **Vuelo entre territorios.** Al saltar de uno a otro desde el menú, la cámara se aleja un
  poco a mitad de camino y vuelve a entrar (`field.lift`).
- **Plano cercano.** Con la cámara dentro del chip hay cúbits detrás o pegados a ella: se
  dejan de dibujar con un fundido, y los botones de sección que caen ahí se ocultan.
- **Etiquetas.** El botón de cada sección cubre su esfera (para poder pulsarla) y lleva el
  nombre al lado contrario del puente; las pestañas se elevan según el radio en pantalla de
  su esfera. En estrecho (≤ 760 px) la cámara se acerca algo más y se desplaza para centrar
  el grupo, las etiquetas son más compactas y el nombre de la sección va debajo.
- Los bordes de la escena se funden con el fondo en el chip, que ahora llega hasta ellos.
- **Movimiento reducido:** sin vuelos; la cámara salta al encuadre y la órbita se aplica al
  instante.
- Los cúbits respiran en vertical, como en campo: solo en altura, la retícula no se
  desalinea nunca.
- Medido en escritorio: la transformación, el arrastre y el chip vivo van a todo refresco
  (p95 14,1 ms; sin el circuito eran 17,6 ms a 60 Hz).

## Sin ficha en los dos primeros niveles

El cliente quiere que en la esfera y en el chip se vea la parte visual, así que **no se abre
la ficha lateral**. Sus contenidos se siguen cargando en la ficha oculta, para cuando haya un
nivel más. Con ella se van también el haz que la unía al punto y el desplazamiento de la
escena a la izquierda: la esfera y el chip se quedan centrados.

Se retiró la clase `has-selection`, que solo servía para estrechar la escena y hacerle sitio a
la ficha. Además de sobrar, ese estrechamiento redimensionaba el lienzo justo cuando arranca
la transformación.

## Pestañas en el chip

Cada pestaña del territorio es una hija en el chip, con su nombre encima (`.field-sub`).
Pulsarla la señala: su cúbit se enciende del todo y las otras dos ceden un poco. Es la única
respuesta visible mientras no haya un tercer nivel. La luz del territorio recorre el camino
real del chip —sección, puente, fila— hasta ellas.

## Menú lateral

Como el raíl de la propuesta de Bloch: los cinco territorios siempre a la vista a la
izquierda, alternativa a buscarlos en la esfera y navegable con teclado. Señalar uno en el
menú lo destaca también en la escena. Desde el chip se salta directamente a otro territorio
y la cámara se desplaza por el chip hasta él.

El menú se presenta de arriba abajo al terminar la intro, el territorio abierto **se ve más
grande** —el nombre se escala, no cambia de cuerpo, así el menú no se recoloca a cada
cambio— y la marca del activo es **una sola pieza que se desplaza** de uno a otro en el
color del territorio, en vez de un borde que se enciende y se apaga: cuenta de dónde vienes
y a dónde vas. En pantallas estrechas el menú va arriba en horizontal, se desplaza solo para
dejar a la vista el territorio abierto y la vuelta se queda fija a la izquierda.

Arriba va **«Universo»**, que vuelve a la esfera. Sin la ficha desapareció su X, y hacía falta
una vuelta visible: en un kiosco táctil no basta con Escape ni con adivinar que se puede
pulsar en vacío (las dos cosas siguen funcionando). No es un territorio más y no se pinta
como tal: va en versaleta, separado por una regla, y **le sale una flecha solo cuando hay
algo de lo que volver** —en el universo no lleva a ninguna parte, y ahí solo dice dónde
estás—.

## Fluidez de la transición

Medido con el mismo método antes y después: la transición pasó de **30 a 60 fps** (un
fotograma cada 16,7 ms, p95 de 17,2, sin tirones).

- **A todo refresco mientras hay movimiento.** El bucle dibujaba como mucho cada 30 ms; en
  reposo basta, pero un despliegue con zoom a medio refresco se ve a saltos. Ahora
  `moving()` detecta transformación, cámara o desplazamiento por el chip y, mientras dura,
  se dibuja en cada refresco.
- **Curvas sin tirón.** Las etapas usan *smootherstep*, que arranca y termina sin
  aceleración; con *smoothstep* quedaba un pequeño golpe al empezar y al acabar.
- **Un solo movimiento.** Despliegue (0–0,7) y entrada de cámara (0,12–1) se solapan casi
  del todo; antes había un valle de velocidad entre los dos y se leían como dos gestos, y la
  cámara —el movimiento grande— tardaba medio segundo en arrancar.
- **Zoom geométrico.** Con escala lineal el acercamiento corría al principio y se arrastraba
  al final; lo que el ojo percibe es la proporción, así que la distancia de la cámara se
  interpola de forma geométrica.
- **Arranca con el clic.** La espera previa es de 0,12 s (`FIELD_DELAY`), lo justo para que
  la luz salga; antes eran 0,55 y la transformación parecía responder a otra cosa. La luz
  convergente no se pierde: sigue viva sobre los puntos que aún son esfera, y esa zona es la
  última en disolverse. La transformación dura 2,8 s (`FIELD_SECONDS`).

---

# Entrega de desarrollo

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

`transform()` rota, `project()` aplica perspectiva y `cameraLayout()` ajusta centro y radio. `focusCamera()` solo **acerca**: ya no gira la esfera para traer el punto al frente (ver «La transformación»). `unfocusCamera()` devuelve la vista general. `positionCard()` calcula la ubicación de la ficha y su conexión desde el mismo punto 3D; actualizarlo junto con la cámara si se cambia la composición.

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
