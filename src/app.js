import { join } from "path";
import {
  createBot,
  createProvider,
  createFlow,
  addKeyword,
  utils,
} from "@builderbot/bot";
import { PostgreSQLAdapter as Database } from "@builderbot/database-postgres";
import { MetaProvider as Provider } from "@builderbot/provider-meta";
import dotenv from "dotenv";
import { OpenAI } from "openai";

import axios from "axios";

dotenv.config();

const PORT = process.env.PORT ?? 3008;

// Configuración de la base de datos
const adapterDB = new Database({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: +process.env.DB_PORT,
});

const discordFlow = addKeyword("doc").addAnswer(
  [
    "You can see the documentation here",
    "📄 https://builderbot.app/docs \n",
    "Do you want to continue? *yes*",
  ].join("\n"),
  { capture: true },
  async (ctx, { gotoFlow, flowDynamic }) => {
    if (ctx.body.toLowerCase().includes("yes")) {
      return gotoFlow(registerFlow);
    }
    await flowDynamic("Thanks!");
  }
);

// Flujo de bienvenida
const welcomeFlow = addKeyword(["Hola", "Buenas"], { matchExactly: true })
  .addAnswer("🙌 Hola! Soy Cami la asistente")
  .addAnswer(
    'Si quieres hacer un pedido o consultar precios y stock por favor escribe "inventario". También puedes buscar: \n' +
      '🧥 Faldas con "Falda", \n👚 Camisas con "Camisa", \n👕 Sudaderas con "Sudadera", \n🧥 Chaquetas con "Chaqueta".',
    { delay: 800, capture: true },
    [discordFlow]
  );


// Registrar usuario
const registerFlow = addKeyword("Registrarme")
  .addAnswer(
    "¿Cuál es tu nombre completo?",
    { capture: true },
    async (ctx, { state }) => {
      await state.update({ name: ctx.body });
    }
  )
  .addAnswer(
    "¿Cuál es la dirección de tu negocio?",
    { capture: true },
    async (ctx, { state }) => {
      await state.update({ businessAddress: ctx.body });
    }
  )
  .addAnswer(
    "¿Cómo se llama tu negocio?",
    { capture: true },
    async (ctx, { state }) => {
      await state.update({ businessName: ctx.body });
    }
  )
.addAction(async (_, { flowDynamic, state }) => {
  // Obtener los valores del estado
  const name = state.get("name");
  const businessName = state.get("businessName");
  const businessAddress = state.get("businessAddress");

  console.log("Información del registro:", { name, businessName, businessAddress });

  await flowDynamic(
    `Gracias por tu información! Aquí está tu registro:\n\n` +
      `👤 Nombre: ${name}\n🏢 Negocio: ${businessName}\n📍 Dirección: ${businessAddress}`
  );
});

// ver registro
const viewRegisterFlow = addKeyword(["ver mi registro", "mis datos"]).addAction(
  async (ctx, { flowDynamic, state }) => {
    const name = state.get("name") ?? "No registrado";
    const businessName = state.get("businessName") ?? "No registrado";
    const businessAddress = state.get("businessAddress") ?? "No registrado";

    await flowDynamic(
      `📋 *Tu información de registro:*\n\n` +
        `👤 Nombre: ${name}\n🏢 Negocio: ${businessName}\n📍 Dirección: ${businessAddress}\n\n` +
        `¿Te gustaría editar tu registro? Responde con *Registrarme* para actualizar tu información.`
    );
  }
);

const editRegisterFlow = addKeyword("editar")
  .addAnswer(
    "¿Qué parte de tu registro te gustaría editar? Escribe *nombre*, *dirección* o *negocio*.",
    { capture: true },
    async (ctx, { flowDynamic }) => {
      const option = ctx.body.toLowerCase();
      if (option === "nombre") {
        return flowDynamic("¿Cuál es tu nuevo nombre completo?");
      } else if (option === "dirección") {
        return flowDynamic("¿Cuál es la nueva dirección de tu negocio?");
      } else if (option === "negocio") {
        return flowDynamic("¿Cómo se llama tu negocio?");
      } else {
        return flowDynamic(
          "Lo siento, no entendí la opción. Responde con *nombre*, *dirección* o *negocio*."
        );
      }
    }
  )
  .addAnswer(
    "Tu información ha sido actualizada.",
    { capture: true },
    async (ctx, { state, flowDynamic }) => {
      const { body } = ctx;
      if (body.toLowerCase().includes("nombre")) {
        await state.update({ name: body });
      } else if (body.toLowerCase().includes("dirección")) {
        await state.update({ businessAddress: body });
      } else if (body.toLowerCase().includes("negocio")) {
        await state.update({ businessName: body });
      }

      await flowDynamic(
        `Tu registro actualizado:\n\n` +
          `👤 Nombre: ${state.get("name")}\n🏢 Negocio: ${state.get(
            "businessName"
          )}\n` +
          `📍 Dirección: ${state.get("businessAddress")}`
      );
    }
  );

// Consulta por inventario
const dataFlow = addKeyword([
  "inventario",
  "preguntar por inventario",
  "consulta inventario",
]).addAnswer(
  "Cargando el inventario para ti...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    try {
      // Obtener datos de la API
      const response = await axios.get(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/users"
      );
      const prendas = response.data;

      ctx.prendas = prendas;
      ctx.seleccionados = []; // Aquí se irán acumulando los items seleccionados

      // Mostrar cada prenda con opciones de compra
      for (const [index, prenda] of prendas.entries()) {
        let message =
          ` • ${prenda.tipo_prenda}\n • Talla: ${prenda.talla}\n • Color: ${prenda.color}\n` +
          `   - Precio 50 unidades: $${prenda.precio_50_u}\n` +
          `   - Precio 100 unidades: $${prenda.precio_100_u}\n` +
          `   - Precio 200 unidades: $${prenda.precio_200_u}\n\n`;

        setTimeout(() => {
          flowDynamic(message, {
            buttons: [
              { body: `Comprar 50 id:${prenda.id}` },
              { body: `Comprar 100id:${prenda.id}` },
              { body: `Comprar 200id:${prenda.id}` },
            ],
          });
        }, index * 800);
      }

      // Mensaje final: indica cómo confirmar el pedido
      setTimeout(() => {
        flowDynamic(
          'Cuando termines de agregar los productos, escribe "confirmar pedido" para finalizar.'
        );
      }, prendas.length * 800);
    } catch (error) {
      flowDynamic(`Error al obtener datos: ${error.message}`);
    }
  }
);
const dataCarrito = addKeyword([
  "carrito",
  "ver carrito",
]).addAnswer(
  "Cargando el carrito para ti...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    const name = state.get("name") ?? "No registrado";
    const businessName = state.get("businessName") ?? "No registrado";
    const businessAddress = state.get("businessAddress") ?? "No registrado";

    const response = await axios.get(
      "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos"
    );
    const prendas = response.data;
    const carrito = response.data;

    let carritoMessage = "";
    if (carrito.length > 0) {
      carritoMessage = "\n🛒 **Detalles del Pedido:**\n";
      carrito.forEach((item, index) => {
        carritoMessage +=
          `\n${index + 1}. **${item.prenda_descripcion}**\n` +
          `- Cantidad: ${item.cantidad}\n` +
          `- Total: $${item.total}\n`;
      });
    } else {
      carritoMessage = "\nNo tienes prendas en tu pedido aún.";
    }

    await flowDynamic(
      `📋 *Tu información de registro:*\n\n` +
        `👤 Nombre: ${name}\n🏢 Negocio: ${businessName}\n📍 Dirección: ${businessAddress}` +
        carritoMessage + // Agregar los detalles del carrito
        `\n\n¿Te gustaría editar tu registro? Responde con *Registrarme* para actualizar tu información.`
    );
  }
);
// confirmar pedido
const dataPedidoConfirmado = addKeyword([
  "confrimar",
  "confirmar pedido",
]).addAnswer(
  "Cargando el carrito para ti...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    const name = state.get("name") ?? "No registrado";
    const businessName = state.get("businessName") ?? "No registrado";
    const businessAddress = state.get("businessAddress") ?? "No registrado";

    const response = await axios.get(
      "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos"
    );
    const prendas = response.data;
    const carrito = response.data;

    let carritoMessage = "";
    if (carrito.length > 0) {
      carritoMessage = "\n🛒 **Detalles del Pedido:**\n";
      carrito.forEach((item, index) => {
        carritoMessage +=
          `\n${index + 1}. **${item.prenda_descripcion}**\n` +
          `- Cantidad: ${item.cantidad}\n` +
          `- Total: $${item.total}\n`;
      });
    } else {
      carritoMessage = "\nNo tienes prendas en tu pedido aún.";
    }

    await flowDynamic(
      `📋 *Tu información de registro:*\n\n` +
        `👤 Nombre: ${name}\n🏢 Negocio: ${businessName}\n📍 Dirección: ${businessAddress}` +
        carritoMessage + // Agregar los detalles del carrito
        `\n\n¿Te gustaría editar tu registro? Responde con *Registrarme* para actualizar tu información.`
    );
  }
);
// filtro faldas
const dataFaldas = addKeyword(["falda", "faldas"])
  .addAnswer(
    "Cargando el inventario para ti...",
    { capture: false },
    async (ctx, { flowDynamic, state }) => {

      // Realizar la llamada POST a la API

      try {
        // Obtener datos de la API y filtrar solo las faldas
        const response = await axios.get(
          "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/users"
        );
        const prendas = response.data.filter(
          (item) => item.tipo_prenda === "Falda"
        );

        // Guardar las prendas en el estado para poder acceder a ellas después
        await state.update({ prendasFalda: prendas });

        for (const [index, prenda] of prendas.entries()) {
          let message =
            ` • ${prenda.tipo_prenda}\n • Talla: ${prenda.talla}\n • Color: ${prenda.color}\n` +
            `   - Precio 50 unidades: $${prenda.precio_50_u}\n` +
            `   - Precio 100 unidades: $${prenda.precio_100_u}\n` +
            `   - Precio 200 unidades: $${prenda.precio_200_u}\n\n`;

          setTimeout(async () => {
            try {
              // Llamada a flowDynamic después de la respuesta exitosa
              await flowDynamic(message, {
                buttons: [
                  { body: `Comprar 50 id:${prenda.id}` },
                  { body: `Comprar 100id:${prenda.id}` },
                  { body: `Comprar 200id:${prenda.id}` },
                ],
              });
            } catch (error) {
              console.error("Error en el POST:", error);
              await flowDynamic(
                "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
              );
            }
          }, index * 800);
        }

        // Mensaje final para que el usuario seleccione
        setTimeout(() => {
          flowDynamic(
            'Cuando termines de agregar los productos, escribe "confirmar pedido" para finalizar.'
          );
        }, prendas.length * 800);
      } catch (error) {
        flowDynamic(`Error al obtener datos: ${error.message}`);
      }
    }
  )
  // Capturar las selecciones del usuario
  .addAnswer(
    "",
    { capture: true },
    async (ctx, { flowDynamic, fallBack, state }) => {
      const seleccion = ctx.body.trim();

      // Si el usuario quiere ver el siguiente producto, simplemente salir
      if (seleccion === "Siguiente producto") {
        return;
      }

      // Si es "confirmar pedido", redirigir a ese flujo y salir
      if (seleccion.toLowerCase() === "confirmar pedido") {
        // Aquí podrías redirigir a otro flujo usando gotoFlow si lo necesitas
        return;
      }

      try {
        // Extraer cantidad e ID usando una expresión regular
        const seleccionMatch = seleccion.match(/Comprar (\d+) id:(\d+)/i);

        if (!seleccionMatch) {
          // Si no es una compra, ignorar y continuar
          if (!seleccion.toLowerCase().includes("comprar")) {
            return;
          }

          await flowDynamic(
            "No se pudo determinar la cantidad o el producto. Por favor, usa los botones para seleccionar."
          );
          return fallBack();
        }

        const cantidad = parseInt(seleccionMatch[1]);
        const prendaId = parseInt(seleccionMatch[2]);

        // Obtener las prendas del estado
        const currentState = await state.get();
        const prendas = currentState.prendasFalda || [];

        // Buscar la prenda por ID
        const prenda = prendas.find((p) => p.id === prendaId);

        if (!prenda) {
          await flowDynamic("No se encontró la prenda seleccionada.");
          return fallBack();
        }

        // Determinar el precio según la cantidad
        let precio;
        if (cantidad === 50) {
          precio = prenda.precio_50_u;
        } else if (cantidad === 100) {
          precio = prenda.precio_100_u;
        } else if (cantidad === 200) {
          precio = prenda.precio_200_u;
        } else {
          await flowDynamic(
            "Cantidad no válida. Por favor, selecciona 50, 100 o 200 unidades."
          );
          return fallBack();
        }

        // Armar los datos del pedido
        const pedidoData = {
          user_id: ctx.user?.id || 1,
          prenda_id: prenda.id,
          cantidad: cantidad,
          precio: precio,
          total: precio * cantidad,
         prenda_descripcion: `${prenda.tipo_prenda} | ${prenda.talla} | ${prenda.color}`,
        };

        console.log("Enviando pedido:", pedidoData);

        // Realizar la petición POST a la API de pedidos
        const postResponse = await axios.post(
          "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
          pedidoData
        );

        if (postResponse.status === 201 || postResponse.status === 200) {
          // Obtener pedidos actuales del estado
          const seleccionados = currentState.seleccionados || [];

          // Añadir el nuevo pedido y actualizar el estado
          seleccionados.push(pedidoData);
          await state.update({ seleccionados });

          await flowDynamic(
            `✅ Pedido agregado: ${cantidad} unidades de ${prenda.tipo_prenda} ${prenda.color} talla ${prenda.talla}.\n` +
              `Total: $${pedidoData.total}\n\n` +
              `Puedes seguir agregando productos o escribir "confirmar pedido" para finalizar.`
          );
        } else {
          await flowDynamic("⚠️ Hubo un problema al registrar el pedido.");
        }
      } catch (error) {
        console.error("Error en el POST del pedido:", error);
        await flowDynamic(
          "❌ Error al procesar tu pedido: " +
            (error.message || "Error desconocido")
        );
      }
    }
  );
////////
const dataCamisas = addKeyword(["camisa", "camisas"])
  .addAnswer(
    "Cargando el inventario para ti...",
    { capture: false },
    async (ctx, { flowDynamic, state }) => {

      try {
        // Obtener datos de la API y filtrar solo las faldas
        const response = await axios.get(
          "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/users"
        );
        const prendas = response.data.filter(
          (item) => item.tipo_prenda === "Camisa"
        );

        // Guardar las prendas en el estado para poder acceder a ellas después
        await state.update({ prendasFalda: prendas });

        for (const [index, prenda] of prendas.entries()) {
          let message =
            ` • ${prenda.tipo_prenda}\n • Talla: ${prenda.talla}\n • Color: ${prenda.color}\n` +
            `   - Precio 50 unidades: $${prenda.precio_50_u}\n` +
            `   - Precio 100 unidades: $${prenda.precio_100_u}\n` +
            `   - Precio 200 unidades: $${prenda.precio_200_u}\n\n`;

          setTimeout(async () => {
            try {
              // Llamada a flowDynamic después de la respuesta exitosa
              await flowDynamic(message, {
                buttons: [
                  { body: `Comprar 50 id:${prenda.id}` },
                  { body: `Comprar 100id:${prenda.id}` },
                  { body: `Comprar 200id:${prenda.id}` },
                ],
              });
            } catch (error) {
              console.error("Error en el POST:", error);
              await flowDynamic(
                "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
              );
            }
          }, index * 800);
        }

        setTimeout(() => {
          flowDynamic(
            'Cuando termines de agregar los productos, escribe "confirmar pedido" para finalizar.'
          );
        }, prendas.length * 800);
      } catch (error) {
        flowDynamic(`Error al obtener datos: ${error.message}`);
      }
    }
  )
  // Capturar las selecciones del usuario
  .addAnswer(
    "",
    { capture: true },
    async (ctx, { flowDynamic, fallBack, state }) => {
      const seleccion = ctx.body.trim();

      // Si el usuario quiere ver el siguiente producto, simplemente salir
      if (seleccion === "Siguiente producto") {
        return;
      }

      // Si es "confirmar pedido", redirigir a ese flujo y salir
      if (seleccion.toLowerCase() === "confirmar pedido") {
        // Aquí podrías redirigir a otro flujo usando gotoFlow si lo necesitas
        return;
      }

      try {
        // Extraer cantidad e ID usando una expresión regular
        const seleccionMatch = seleccion.match(/Comprar (\d+) id:(\d+)/i);

        if (!seleccionMatch) {
          // Si no es una compra, ignorar y continuar
          if (!seleccion.toLowerCase().includes("comprar")) {
            return;
          }

          await flowDynamic(
            "No se pudo determinar la cantidad o el producto. Por favor, usa los botones para seleccionar."
          );
          return fallBack();
        }

        const cantidad = parseInt(seleccionMatch[1]);
        const prendaId = parseInt(seleccionMatch[2]);

        // Obtener las prendas del estado
        const currentState = await state.get();
        const prendas = currentState.prendasFalda || [];

        // Buscar la prenda por ID
        const prenda = prendas.find((p) => p.id === prendaId);

        if (!prenda) {
          await flowDynamic("No se encontró la prenda seleccionada.");
          return fallBack();
        }

        // Determinar el precio según la cantidad
        let precio;
        if (cantidad === 50) {
          precio = prenda.precio_50_u;
        } else if (cantidad === 100) {
          precio = prenda.precio_100_u;
        } else if (cantidad === 200) {
          precio = prenda.precio_200_u;
        } else {
          await flowDynamic(
            "Cantidad no válida. Por favor, selecciona 50, 100 o 200 unidades."
          );
          return fallBack();
        }

        console.log("Enviando pedido:", pedidoData);


        if (postResponse.status === 201 || postResponse.status === 200) {
          // Obtener pedidos actuales del estado
          const seleccionados = currentState.seleccionados || [];

          // Añadir el nuevo pedido y actualizar el estado
          seleccionados.push(pedidoData);
          await state.update({ seleccionados });

          await flowDynamic(
            `✅ Pedido agregado: ${cantidad} unidades de ${prenda.tipo_prenda} ${prenda.color} talla ${prenda.talla}.\n` +
              `Total: $${pedidoData.total}\n\n` +
              `Puedes seguir agregando productos o escribir "confirmar pedido" para finalizar.`
          );
        } else {
          await flowDynamic("⚠️ Hubo un problema al registrar el pedido.");
        }
      } catch (error) {
        console.error("Error en el POST del pedido:", error);
        await flowDynamic(
          "❌ Error al procesar tu pedido: " +
            (error.message || "Error desconocido")
        );
      }
    }
  );
/////////////
const dataChaqueta = addKeyword(["chaqueta", "chaquetas"])
  .addAnswer(
    "Cargando el inventario para ti...",
    { capture: false },
    async (ctx, { flowDynamic, state }) => {

      try {
        // Obtener datos de la API y filtrar solo las faldas
        const response = await axios.get(
          "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/users"
        );
        const prendas = response.data.filter(
          (item) => item.tipo_prenda === "Chaqueta"
        );

        // Guardar las prendas en el estado para poder acceder a ellas después
        await state.update({ prendasFalda: prendas });

        for (const [index, prenda] of prendas.entries()) {
          let message =
            ` • ${prenda.tipo_prenda}\n • Talla: ${prenda.talla}\n • Color: ${prenda.color}\n` +
            `   - Precio 50 unidades: $${prenda.precio_50_u}\n` +
            `   - Precio 100 unidades: $${prenda.precio_100_u}\n` +
            `   - Precio 200 unidades: $${prenda.precio_200_u}\n\n`;

          setTimeout(async () => {
            try {
              // Llamada a flowDynamic después de la respuesta exitosa
              await flowDynamic(message, {
                buttons: [
                  { body: `Comprar 50 id:${prenda.id}` },
                  { body: `Comprar 100id:${prenda.id}` },
                  { body: `Comprar 200id:${prenda.id}` },
                ],
              });
            } catch (error) {
              console.error("Error en el POST:", error);
              await flowDynamic(
                "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
              );
            }
          }, index * 800);
        }

        // Mensaje final para que el usuario seleccione
        setTimeout(() => {
          flowDynamic(
            'Cuando termines de agregar los productos, escribe "confirmar pedido" para finalizar.'
          );
        }, prendas.length * 800);
      } catch (error) {
        flowDynamic(`Error al obtener datos: ${error.message}`);
      }
    }
  )
  // Capturar las selecciones del usuario
  .addAnswer(
    "",
    { capture: true },
    async (ctx, { flowDynamic, fallBack, state }) => {
      const seleccion = ctx.body.trim();

      // Si el usuario quiere ver el siguiente producto, simplemente salir
      if (seleccion === "Siguiente producto") {
        return;
      }

      // Si es "confirmar pedido", redirigir a ese flujo y salir
      if (seleccion.toLowerCase() === "confirmar pedido") {
        return;
      }

      try {
        const seleccionMatch = seleccion.match(/Comprar (\d+) id:(\d+)/i);

        if (!seleccionMatch) {
          // Si no es una compra, ignorar y continuar
          if (!seleccion.toLowerCase().includes("comprar")) {
            return;
          }

          await flowDynamic(
            "No se pudo determinar la cantidad o el producto. Por favor, usa los botones para seleccionar."
          );
          return fallBack();
        }

        const cantidad = parseInt(seleccionMatch[1]);
        const prendaId = parseInt(seleccionMatch[2]);

        // Obtener las prendas del estado
        const currentState = await state.get();
        const prendas = currentState.prendasFalda || [];

        // Buscar la prenda por ID
        const prenda = prendas.find((p) => p.id === prendaId);

        if (!prenda) {
          await flowDynamic("No se encontró la prenda seleccionada.");
          return fallBack();
        }

        // Determinar el precio según la cantidad
        let precio;
        if (cantidad === 50) {
          precio = prenda.precio_50_u;
        } else if (cantidad === 100) {
          precio = prenda.precio_100_u;
        } else if (cantidad === 200) {
          precio = prenda.precio_200_u;
        } else {
          await flowDynamic(
            "Cantidad no válida. Por favor, selecciona 50, 100 o 200 unidades."
          );
          return fallBack();
        }

        // Armar los datos del pedido
        const pedidoData = {
          user_id: ctx.user?.id || 1,
          prenda_id: prenda.id,
          cantidad: cantidad,
          precio: precio,
          total: precio * cantidad,
          prenda_prenda_descripcion: `${prenda.tipo_prenda} | ${prenda.talla} | ${prenda.color}`,
        };

        console.log("Enviando pedido:", pedidoData);

        // Realizar la petición POST a la API de pedidos
        const postResponse = await axios.post(
          "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
          pedidoData
        );

        if (postResponse.status === 201 || postResponse.status === 200) {
          // Obtener pedidos actuales del estado
          const seleccionados = currentState.seleccionados || [];

          // Añadir el nuevo pedido y actualizar el estado
          seleccionados.push(pedidoData);
          await state.update({ seleccionados });

          await flowDynamic(
            `✅ Pedido agregado: ${cantidad} unidades de ${prenda.tipo_prenda} ${prenda.color} talla ${prenda.talla}.\n` +
              `Total: $${pedidoData.total}\n\n` +
              `Puedes seguir agregando productos o escribir "confirmar pedido" para finalizar.`
          );
        } else {
          await flowDynamic("⚠️ Hubo un problema al registrar el pedido.");
        }
      } catch (error) {
        console.error("Error en el POST del pedido:", error);
        await flowDynamic(
          "❌ Error al procesar tu pedido: " +
            (error.message || "Error desconocido")
        );
      }
    }
  );
/////////////
const dataSudadera = addKeyword(["sudadera", "sudaderas"])
  .addAnswer(
    "Cargando el inventario para ti...",
    { capture: false },
    async (ctx, { flowDynamic, state }) => {


      try {
        // Obtener datos de la API y filtrar solo las faldas
        const response = await axios.get(
          "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/users"
        );
        const prendas = response.data.filter(
          (item) => item.tipo_prenda === "Sudadera"
        );

        await state.update({ prendasFalda: prendas });

        for (const [index, prenda] of prendas.entries()) {
          let message =
            ` • ${prenda.tipo_prenda}\n • Talla: ${prenda.talla}\n • Color: ${prenda.color}\n` +
            `   - Precio 50 unidades: $${prenda.precio_50_u}\n` +
            `   - Precio 100 unidades: $${prenda.precio_100_u}\n` +
            `   - Precio 200 unidades: $${prenda.precio_200_u}\n\n`;

          setTimeout(async () => {
            try {
              // Llamada a flowDynamic después de la respuesta exitosa
              await flowDynamic(message, {
                buttons: [
                  { body: `Comprar 50 id:${prenda.id}` },
                  { body: `Comprar 100id:${prenda.id}` },
                  { body: `Comprar 200id:${prenda.id}` },
                ],
              });
            } catch (error) {
              console.error("Error en el POST:", error);
              await flowDynamic(
                "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
              );
            }
          }, index * 800);
        }

        // Mensaje final para que el usuario seleccione
        setTimeout(() => {
          flowDynamic(
            'Cuando termines de agregar los productos, escribe "confirmar pedido" para finalizar.'
          );
        }, prendas.length * 800);
      } catch (error) {
        flowDynamic(`Error al obtener datos: ${error.message}`);
      }
    }
  )
  // Capturar las selecciones del usuario
  .addAnswer(
    "",
    { capture: true },
    async (ctx, { flowDynamic, fallBack, state }) => {
      const seleccion = ctx.body.trim();

      // Si el usuario quiere ver el siguiente producto, simplemente salir
      if (seleccion === "Siguiente producto") {
        return;
      }

      // Si es "confirmar pedido", redirigir a ese flujo y salir
      if (seleccion.toLowerCase() === "confirmar pedido") {
        // Aquí podrías redirigir a otro flujo usando gotoFlow si lo necesitas
        return;
      }

      try {
        // Extraer cantidad e ID usando una expresión regular
        const seleccionMatch = seleccion.match(/Comprar (\d+) id:(\d+)/i);

        if (!seleccionMatch) {
          // Si no es una compra, ignorar y continuar
          if (!seleccion.toLowerCase().includes("comprar")) {
            return;
          }

          await flowDynamic(
            "No se pudo determinar la cantidad o el producto. Por favor, usa los botones para seleccionar."
          );
          return fallBack();
        }

        const cantidad = parseInt(seleccionMatch[1]);
        const prendaId = parseInt(seleccionMatch[2]);

        // Obtener las prendas del estado
        const currentState = await state.get();
        const prendas = currentState.prendasFalda || [];

        // Buscar la prenda por ID
        const prenda = prendas.find((p) => p.id === prendaId);

        if (!prenda) {
          await flowDynamic("No se encontró la prenda seleccionada.");
          return fallBack();
        }

        // Determinar el precio según la cantidad
        let precio;
        if (cantidad === 50) {
          precio = prenda.precio_50_u;
        } else if (cantidad === 100) {
          precio = prenda.precio_100_u;
        } else if (cantidad === 200) {
          precio = prenda.precio_200_u;
        } else {
          await flowDynamic(
            "Cantidad no válida. Por favor, selecciona 50, 100 o 200 unidades."
          );
          return fallBack();
        }

        if (postResponse.status === 201 || postResponse.status === 200) {
          // Obtener pedidos actuales del estado
          const seleccionados = currentState.seleccionados || [];

          // Añadir el nuevo pedido y actualizar el estado
          seleccionados.push(pedidoData);
          await state.update({ seleccionados });

          await flowDynamic(
            `✅ Pedido agregado: ${cantidad} unidades de ${prenda.tipo_prenda} ${prenda.color} talla ${prenda.talla}.\n` +
              `Total: $${pedidoData.total}\n\n` +
              `Puedes seguir agregando productos o escribir "confirmar pedido" para finalizar.`
          );
        } else {
          await flowDynamic("⚠️ Hubo un problema al registrar el pedido.");
        }
      } catch (error) {
        console.error("Error en el POST del pedido:", error);
        await flowDynamic(
          "❌ Error al procesar tu pedido: " +
            (error.message || "Error desconocido")
        );
      }
    }
  );
/////////////
const compra1 = addKeyword(["Comprar 50 id:01"], { matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Preparar los datos del pedido usando los nombres de campo esperados por la API
    const pedidoData = {
        user_id: 1,
        prenda_id: "1",
        cantidad: 50,
        precio: 1058.0,
        total: 1058.0,
        prenda_descripcion: "Pantalón XXL verde"
      };
    
    // Imprimir los datos que se van a enviar a la API
    console.log("Datos que se envían a la API:", pedidoData);

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);


const compra2 = addKeyword(["Comprar 100id:01"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Preparar los datos del pedido para 100 unidades
    const pedidoData = {
      user_id: 1,
      prenda_id: 1,
      cantidad: 100,
      precio: 2030.0,
      total: 2030.0,
      prenda_descripcion: "Pantalón XXL verde"
    };

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra3 = addKeyword(["Comprar 200id:01"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Preparar los datos del pedido para 200 unidades
    const pedidoData = {
      user_id: 1,
      prenda_id: 1,
      cantidad: 200,
      precio: 4050.0,
      total: 4050.0,
      prenda_descripcion: "Pantalón XXL verde"
    };

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra4 = addKeyword(["Comprar 50 id:02"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Datos del pedido para 50 unidades
    const pedidoData = {
      user_id: 1,
      prenda_id: 2,
      cantidad: 50,
      precio: 510.0,
      total: 510.0,
      prenda_descripcion: "Camiseta XXL Blanca"
    };

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra5 = addKeyword(["Comprar 100id:02"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Datos del pedido para 100 unidades
    const pedidoData = {
      user_id: 1,
      prenda_id: 2,
      cantidad: 100,
      precio: 975.0,
      total: 975.0,
      prenda_descripcion: "Camiseta XXL Blanca"
    };

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra6 = addKeyword(["Comprar 200id:02"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Datos del pedido para 200 unidades
    const pedidoData = {
      user_id: 1,
      prenda_id: 2,
      cantidad: 200,
      precio: 739.0,
      total: 739.0,
      prenda_descripcion: "Camiseta XXL Blanca"
    };

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra7 = addKeyword(["Comprar 50 id:03"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Datos del pedido para 50 unidades
    const pedidoData = {
      user_id: 1,
      prenda_id: 3,
      cantidad: 50,
      precio: 457.0,
      total: 457.0,
      prenda_descripcion: "Camiseta S Negra"
    };

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra8 = addKeyword(["Comprar 100id:03"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Datos del pedido para 100 unidades
    const pedidoData = {
      user_id: 1,
      prenda_id: 3,
      cantidad: 100,
      precio: 1292.0,
      total: 1292.0,
      prenda_descripcion: "Camiseta S Negra"
    };

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra9 = addKeyword(["Comprar 200id:03"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    // Datos del pedido para 200 unidades
    const pedidoData = {
      user_id: 1,
      prenda_id: 3,
      cantidad: 200,
      precio: 873.0,
      total: 873.0,
      prenda_descripcion: "Camiseta S Negra"
    };

    try {
      // Realizar la llamada POST a la API con el header adecuado
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      // Verificar si la respuesta fue exitosa (200 o 201)
      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
// Falda S Blanca - ID 4
const compra10 = addKeyword(["Comprar 50 id:04"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 4,
      cantidad: 50,
      precio: 1138.0,
      total: 1138.0,
      prenda_descripcion: "Falda S Blanca"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra11 = addKeyword(["Comprar 100id:04"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 4,
      cantidad: 100,
      precio: 986.0,
      total: 986.0,
      prenda_descripcion: "Falda S Blanca"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra12 = addKeyword(["Comprar 200id:04"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 4,
      cantidad: 200,
      precio: 386.0,
      total: 386.0,
      prenda_descripcion: "Falda S Blanca"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

// Sudadera XL Verde - ID 5
const compra13 = addKeyword(["Comprar 50 id:05"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 5,
      cantidad: 50,
      precio: 603.0,
      total: 603.0,
      prenda_descripcion: "Sudadera XL Verde"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra14 = addKeyword(["Comprar 100id:05"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 5,
      cantidad: 100,
      precio: 799.0,
      total: 799.0,
      prenda_descripcion: "Sudadera XL Verde"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra15 = addKeyword(["Comprar 200id:05"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 5,
      cantidad: 200,
      precio: 367.0,
      total: 367.0,
      prenda_descripcion: "Sudadera XL Verde"
    }

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

// Chaqueta S Amarilla - ID 6
const compra16 = addKeyword(["Comprar 50 id:06"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 6,
      cantidad: 50,
      precio: 961.0,
      total: 961.0,
      prenda_descripcion: "Chaqueta S Amarilla"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);
const compra17 = addKeyword(["Comprar 100id:06"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 6,
      cantidad: 100,
      precio: 636.0,
      total: 636.0,
      prenda_descripcion: "Chaqueta S Amarilla"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra18 = addKeyword(["Comprar 200id:06"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 6,
      cantidad: 200,
      precio: 1014.0,
      total: 1014.0,
      prenda_descripcion: "Chaqueta S Amarilla"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);
const compra19 = addKeyword(["Comprar 50 id:07"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 7,
      cantidad: 50,
      precio: 1331.0,
      total: 1331.0,
      prenda_descripcion: "Pantalón L Gris"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra20 = addKeyword(["Comprar 100id:07"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 7,
      cantidad: 100,
      precio: 1222.0,
      total: 1222.0,
      prenda_descripcion: "Pantalón L Gris"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra21 = addKeyword(["Comprar 200id:07"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 7,
      cantidad: 200,
      precio: 516.0,
      total: 516.0,
      prenda_descripcion: "Pantalón L Gris"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra22 = addKeyword(["Comprar 50 id:08"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 8,
      cantidad: 50,
      total: 1286.0,
      prenda_descripcion: "Falda XXL Blanco",
      precio: 1286.0    
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra23 = addKeyword(["Comprar 100id:08"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 8,
      cantidad: 100,
      precio: 1306.0,
      total: 1306.0,
      prenda_descripcion: "Falda XXL Blanco"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra24 = addKeyword(["Comprar 200id:08"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 8,
      cantidad: 200,
      precio: 613.0,
      total: 613.0,
      prenda_descripcion: "Falda XXL Blanco"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);
const compra25 = addKeyword(["Comprar 50 id:09"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 9,
      cantidad: 50,
      precio: 889.0,
      total: 889.0,
      prenda_descripcion: "Sudadera L Azul"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra26 = addKeyword(["Comprar 100id:09"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 9,
      cantidad: 100,
      precio: 991.0,
      total: 991.0,
      prenda_descripcion: "Sudadera L Azul"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra27 = addKeyword(["Comprar 200id:09"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 9,
      cantidad: 200,
      precio: 608.0,
      total: 608.0,
      prenda_descripcion: "Sudadera L Azul"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra28 = addKeyword(["Comprar 50 id:10"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 10,
      cantidad: 50,
      precio: 647.0,
      total: 647.0,
      prenda_descripcion: "Pantalón XXL Gris"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra29 = addKeyword(["Comprar 100id:10"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 10,
      cantidad: 100,
      precio: 1149.0,
      total: 1149.0,
      prenda_descripcion: "Pantalón XXL Gris"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra30 = addKeyword(["Comprar 200id:10"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 10,
      cantidad: 200,
      precio: 542.0,
      total: 542.0,
      prenda_descripcion: "Pantalón XXL Gris"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);
const compra31 = addKeyword(["Comprar 50 id:11"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 11,
      cantidad: 50,
      precio: 1109.0,
      total: 1109.0,
      prenda_descripcion: "Chaqueta S Azul"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra32 = addKeyword(["Comprar 100id:11"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 11,
      cantidad: 100,
      precio: 555.0,
      total: 555.0,
      prenda_descripcion: "Chaqueta S Azul"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra33 = addKeyword(["Comprar 200id:11"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 11,
      cantidad: 200,
      precio: 464.0,
      total: 464.0,
      prenda_descripcion: "Chaqueta S Azul"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra34 = addKeyword(["Comprar 50 id:12"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 12,
      cantidad: 50,
      precio: 941.0,
      total: 941.0,
      prenda_descripcion: "Pantalón M Blanco"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra35 = addKeyword(["Comprar 100id:12"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 12,
      cantidad: 100,
      precio: 640.0,
      total: 640.0,
      prenda_descripcion: "Pantalón M Blanco"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);

const compra36 = addKeyword(["Comprar 200id:12"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 12,
      cantidad: 200,
      precio: 786.0,
      total: 786.0,
      prenda_descripcion: "Pantalón M Blanco"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error("Error en el POST:", error);
      await flowDynamic("Hubo un problema al realizar el pedido.");
    }
  }
);
const compra37 = addKeyword(["Comprar 50 id:13"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 13,
      cantidad: 50,
      precio: 1123.0,
      total: 1123.0,
      prenda_descripcion: "Falda XL Azul - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra38 = addKeyword(["Comprar 100id:13"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 13,
      cantidad: 100,
      precio: 898.0,
      total: 898.0,
      prenda_descripcion: "Falda XL Azul - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra39 = addKeyword(["Comprar 200id:13"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 13,
      cantidad: 200,
      precio: 898.0,
      total: 898.0,
      prenda_descripcion: "Falda XL Azul - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra40 = addKeyword(["Comprar 50 id:14"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 14,
      cantidad: 50,
      precio: 903.0,
      total: 903.0,
      prenda_descripcion: "Chaqueta L Gris - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra41 = addKeyword(["Comprar 100id:14"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 14,
      cantidad: 100,
      precio: 940.0,
      total: 940.0,
      prenda_descripcion: "Chaqueta L Gris - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra42 = addKeyword(["Comprar 200id:14"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 14,
      cantidad: 200,
      precio: 940.0,
      total: 940.0,
      prenda_descripcion: "Chaqueta L Gris - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra43 = addKeyword(["Comprar 50 id:15"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 15,
      cantidad: 50,
      precio: 952.0,
      total: 952.0,
      prenda_descripcion: "Falda L Azul - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra44 = addKeyword(["Comprar 100id:15"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 15,
      cantidad: 100,
      precio: 530.0,
      total: 530.0,
      prenda_descripcion: "Falda L Azul - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra45 = addKeyword(["Comprar 200id:15"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 15,
      cantidad: 200,
      precio: 530.0,
      total: 530.0,
      prenda_descripcion: "Falda L Azul - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra46 = addKeyword(["Comprar 50 id:16"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 16,
      cantidad: 50,
      precio: 883.0,
      total: 883.0,
      prenda_descripcion: "Falda XL Blanco - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra47 = addKeyword(["Comprar 100id:16"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 16,
      cantidad: 100,
      precio: 693.0,
      total: 693.0,
      prenda_descripcion: "Falda XL Blanco - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra48 = addKeyword(["Comprar 200id:16"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 16,
      cantidad: 200,
      precio: 693.0,
      total: 693.0,
      prenda_descripcion: "Falda XL Blanco - Prenda cómoda y ligera."
      
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra49 = addKeyword(["Comprar 50 id:17"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 17,
      cantidad: 50,
      precio: 1128.0,
      total: 1128.0,
      prenda_descripcion: "Camiseta S Azul - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra50 = addKeyword(["Comprar 100id:17"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 17,
      cantidad: 100,
      precio: 1351.0,
      total: 1351.0,
      prenda_descripcion: "Camiseta S Azul - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra51 = addKeyword(["Comprar 200id:17"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 17,
      cantidad: 200,
      precio: 1351.0,
      total: 1351.0,
      prenda_descripcion: "Camiseta S Azul - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra52 = addKeyword(["Comprar 50 id:18"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 18,
      cantidad: 50,
      precio: 1224.0,
      total: 1224.0,
      prenda_descripcion: "Falda L Gris - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra53 = addKeyword(["Comprar 100id:18"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 18,
      cantidad: 100,
      precio: 1394.0,
      total: 1394.0,
      prenda_descripcion: "Falda L Gris - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra54 = addKeyword(["Comprar 200id:18"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 18,
      cantidad: 200,
      precio: 1394.0,
      total: 1394.0,
      prenda_descripcion: "Falda L Gris - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra55 = addKeyword(["Comprar 50 id:19"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 19,
      cantidad: 50,
      precio: 416.0,
      total: 416.0,
      prenda_descripcion: "Chaqueta L Azul - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra56 = addKeyword(["Comprar 100id:19"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 19,
      cantidad: 100,
      precio: 416.0,
      total: 416.0,
      prenda_descripcion: "Chaqueta L Azul - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra57 = addKeyword(["Comprar 200id:19"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 19,
      cantidad: 200,
      precio: 416.0,
      total: 416.0,
      prenda_descripcion: "Chaqueta L Azul - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra58 = addKeyword(["Comprar 50 id:20"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 20,
      cantidad: 50,
      precio: 1292.0,
      total: 1292.0,
      prenda_descripcion: "Camiseta XXL Rojo - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra59 = addKeyword(["Comprar 100id:20"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 20,
      cantidad: 100,
      precio: 1292.0,
      total: 1292.0,
      prenda_descripcion: "Camiseta XXL Rojo - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra60 = addKeyword(["Comprar 200id:20"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 20,
      cantidad: 200,
      precio: 1292.0,
      total: 1292.0,
      prenda_descripcion: "Camiseta XXL Rojo - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra61 = addKeyword(["Comprar 50 id:21"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 21,
      cantidad: 50,
      precio: 1017.0,
      total: 1017.0,
      prenda_descripcion: "Pantalón L Verde - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra62 = addKeyword(["Comprar 100id:21"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 21,
      cantidad: 100,
      precio: 1017.0,
      total: 1017.0,
      prenda_descripcion: "Pantalón L Verde - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra63 = addKeyword(["Comprar 200id:21"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 21,
      cantidad: 200,
      precio: 1017.0,
      total: 1017.0,
      prenda_descripcion: "Pantalón L Verde - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra64 = addKeyword(["Comprar 50 id:22"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 22,
      cantidad: 50,
      precio: 1288.0,
      total: 1288.0,
      prenda_descripcion: "Sudadera XL Azul - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra65 = addKeyword(["Comprar 100id:22"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 22,
      cantidad: 100,
      precio: 1288.0,
      total: 1288.0,
      prenda_descripcion: "Sudadera XL Azul - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra66 = addKeyword(["Comprar 200id:22"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 22,
      cantidad: 200,
      precio: 1288.0,
      total: 1288.0,
      prenda_descripcion: "Sudadera XL Azul - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra67 = addKeyword(["Comprar 50 id:23"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 23,
      cantidad: 50,
      precio: 525.0,
      total: 525.0,
      prenda_descripcion: "Pantalón S Verde - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra68 = addKeyword(["Comprar 100id:23"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 23,
      cantidad: 100,
      precio: 525.0,
      total: 525.0,
      prenda_descripcion: "Pantalón S Verde - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra69 = addKeyword(["Comprar 200id:23"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 23,
      cantidad: 200,
      precio: 525.0,
      total: 525.0,
      prenda_descripcion: "Pantalón S Verde - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra70 = addKeyword(["Comprar 50 id:24"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 24,
      cantidad: 50,
      precio: 1386.0,
      total: 1386.0,
      prenda_descripcion: "Camiseta M Negro - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra71 = addKeyword(["Comprar 100id:24"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 24,
      cantidad: 100,
      precio: 1386.0,
      total: 1386.0,
      prenda_descripcion: "Camiseta M Negro - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra72 = addKeyword(["Comprar 200id:24"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 24,
      cantidad: 200,
      precio: 1386.0,
      total: 1386.0,
      prenda_descripcion: "Camiseta M Negro - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra73 = addKeyword(["Comprar 50 id:25"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 25,
      cantidad: 50,
      precio: 596.0,
      total: 596.0,
      prenda_descripcion:
        "Sudadera S Negro - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra74 = addKeyword(["Comprar 100id:25"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 25,
      cantidad: 100,
      precio: 596.0,
      total: 596.0,
      prenda_descripcion:
        "Sudadera S Negro - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra75 = addKeyword(["Comprar 200id:25"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 25,
      cantidad: 200,
      precio: 596.0,
      total: 596.0,
      prenda_descripcion:
        "Sudadera S Negro - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra76 = addKeyword(["Comprar 50 id:26"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 26,
      cantidad: 50,
      precio: 503.0,
      total: 503.0,
      prenda_descripcion: "Camiseta S Verde - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra77 = addKeyword(["Comprar 100id:26"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 26,
      cantidad: 100,
      precio: 503.0,
      total: 503.0,
      prenda_descripcion: "Camiseta S Verde - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra78 = addKeyword(["Comprar 200id:26"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 26,
      cantidad: 200,
      precio: 503.0,
      total: 503.0,
      prenda_descripcion: "Camiseta S Verde - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra79 = addKeyword(["Comprar 50 id:27"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 27,
      cantidad: 50,
      precio: 967.0,
      total: 967.0,
      prenda_descripcion: "Sudadera S Verde - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra80 = addKeyword(["Comprar 100id:27"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 27,
      cantidad: 100,
      precio: 967.0,
      total: 967.0,
      prenda_descripcion: "Sudadera S Verde - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra81 = addKeyword(["Comprar 200id:27"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 27,
      cantidad: 200,
      precio: 967.0,
      total: 967.0,
      prenda_descripcion: "Sudadera S Verde - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra82 = addKeyword(["Comprar 50 id:28"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 28,
      cantidad: 50,
      precio: 464.0,
      total: 464.0,
      prenda_descripcion:
        "Falda XL Negro - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra83 = addKeyword(["Comprar 100id:28"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 28,
      cantidad: 100,
      precio: 464.0,
      total: 464.0,
      prenda_descripcion:
        "Falda XL Negro - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra84 = addKeyword(["Comprar 200id:28"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 28,
      cantidad: 200,
      precio: 464.0,
      total: 464.0,
      prenda_descripcion:
        "Falda XL Negro - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra85 = addKeyword(["Comprar 50 id:29"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 29,
      cantidad: 50,
      precio: 1465.0,
      total: 1465.0,
      prenda_descripcion: "Chaqueta XL Amarillo - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra86 = addKeyword(["Comprar 100id:29"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 29,
      cantidad: 100,
      precio: 1465.0,
      total: 1465.0,
      prenda_descripcion: "Chaqueta XL Amarillo - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra87 = addKeyword(["Comprar 200id:29"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 29,
      cantidad: 200,
      precio: 1465.0,
      total: 1465.0,
      prenda_descripcion: "Chaqueta XL Amarillo - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra88 = addKeyword(["Comprar 50 id:30"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 30,
      cantidad: 50,
      precio: 1100.0,
      total: 1100.0,
      prenda_descripcion: "Camisa M Verde - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra89 = addKeyword(["Comprar 100id:30"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 30,
      cantidad: 100,
      precio: 1100.0,
      total: 1100.0,
      prenda_descripcion: "Camisa M Verde - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra90 = addKeyword(["Comprar 200id:30"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 30,
      cantidad: 200,
      precio: 1100.0,
      total: 1100.0,
      prenda_descripcion: "Camisa M Verde - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra91 = addKeyword(["Comprar 50 id:31"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 31,
      cantidad: 50,
      precio: 1006.0,
      total: 1006.0,
      prenda_descripcion: "Falda XXL Blanco - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra92 = addKeyword(["Comprar 100id:31"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 31,
      cantidad: 100,
      precio: 1006.0,
      total: 1006.0,
      prenda_descripcion: "Falda XXL Blanco - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra93 = addKeyword(["Comprar 200id:31"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 31,
      cantidad: 200,
      precio: 1006.0,
      total: 1006.0,
      prenda_descripcion: "Falda XXL Blanco - Prenda cómoda y ligera."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra94 = addKeyword(["Comprar 50 id:32"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 32,
      cantidad: 50,
      precio: 1010.0,
      total: 1010.0,
      prenda_descripcion:
        "Camiseta S Rojo - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra95 = addKeyword(["Comprar 100id:32"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 32,
      cantidad: 100,
      precio: 1010.0,
      total: 1010.0,
      prenda_descripcion:
        "Camiseta S Rojo - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra96 = addKeyword(["Comprar 200id:32"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 32,
      cantidad: 200,
      precio: 1010.0,
      total: 1010.0,
      prenda_descripcion:
        "Camiseta S Rojo - Perfecta para actividades al aire libre."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra97 = addKeyword(["Comprar 50 id:33"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 33,
      cantidad: 50,
      precio: 1120.0,
      total: 1120.0,
      prenda_descripcion: "Falda M Azul - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra98 = addKeyword(["Comprar 100id:33"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 33,
      cantidad: 100,
      precio: 1120.0,
      total: 1120.0,
      prenda_descripcion: "Falda M Azul - Diseño moderno y elegante."
      
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra99 = addKeyword(["Comprar 200id:33"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 33,
      cantidad: 200,
      precio: 1120.0,
      total: 1120.0,
      prenda_descripcion: "Falda M Azul - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra100 = addKeyword(["Comprar 50 id:34"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 34,
      cantidad: 50,
      precio: 548.0,
      total: 548.0,
      prenda_descripcion: "Camisa L Blanco - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra101 = addKeyword(["Comprar 100id:34"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 34,
      cantidad: 100,
      precio: 548.0,
      total: 548.0,
      prenda_descripcion: "Camisa L Blanco - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra102 = addKeyword(["Comprar 200id:34"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 34,
      cantidad: 200,
      precio: 548.0,
      total: 548.0,
      prenda_descripcion: "Camisa L Blanco - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra103 = addKeyword(["Comprar 50 id:35"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 35,
      cantidad: 50,
      precio: 783.0,
      total: 783.0,
      prenda_descripcion: "Camisa XXL Verde - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra104 = addKeyword(["Comprar 100id:35"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 35,
      cantidad: 100,
      precio: 783.0,
      total: 783.0,
      prenda_descripcion: "Camisa XXL Verde - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra105 = addKeyword(["Comprar 200id:35"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 35,
      cantidad: 200,
      precio: 783.0,
      total: 783.0,
      prenda_descripcion: "Camisa XXL Verde - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra106 = addKeyword(["Comprar 50 id:36"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 36,
      cantidad: 50,
      precio: 1261.0,
      total: 1261.0,
      prenda_descripcion: "Sudadera XXL Amarillo - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra107 = addKeyword(["Comprar 100id:36"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 36,
      cantidad: 100,
      precio: 1261.0,
      total: 1261.0,
      prenda_descripcion: "Sudadera XXL Amarillo - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra108 = addKeyword(["Comprar 200id:36"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 36,
      cantidad: 200,
      precio: 1261.0,
      total: 1261.0,
      prenda_descripcion: "Sudadera XXL Amarillo - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra109 = addKeyword(["Comprar 50 id:37"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 37,
      cantidad: 50,
      precio: 925.0,
      total: 925.0,
      prenda_descripcion: "Sudadera S Negra - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra110 = addKeyword(["Comprar 100id:37"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 37,
      cantidad: 100,
      precio: 925.0,
      total: 925.0,
      prenda_descripcion: "Sudadera S Negra - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra111 = addKeyword(["Comprar 200id:37"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 37,
      cantidad: 200,
      precio: 925.0,
      total: 925.0,
      prenda_descripcion: "Sudadera S Negra - Ideal para uso diario."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra112 = addKeyword(["Comprar 50 id:38"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 38,
      cantidad: 50,
      precio: 1379.0,
      total: 1379.0,
      prenda_descripcion: "Pantalón XXL Rojo - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra113 = addKeyword(["Comprar 100id:38"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 38,
      cantidad: 100,
      precio: 1379.0,
      total: 1379.0,
      prenda_descripcion: "Pantalón XXL Rojo - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra114 = addKeyword(["Comprar 200id:38"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 38,
      cantidad: 200,
      precio: 1379.0,
      total: 1379.0,
      prenda_descripcion: "Pantalón XXL Rojo - Material de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra115 = addKeyword(["Comprar 50 id:39"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 39,
      cantidad: 50,
      precio: 1338.0,
      total: 1338.0,
      prenda_descripcion: "Pantalón M Verde - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra116 = addKeyword(["Comprar 100id:39"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 39,
      cantidad: 100,
      precio: 1338.0,
      total: 1338.0,
      prenda_descripcion: "Pantalón M Verde - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra117 = addKeyword(["Comprar 200id:39"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 39,
      cantidad: 200,
      precio: 1338.0,
      total: 1338.0,
      prenda_descripcion: "Pantalón M Verde - Diseño moderno y elegante."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra118 = addKeyword(["Comprar 50 id:40"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 40,
      cantidad: 50,
      precio: 9.99,
      total: 9.99,
      prenda_descripcion:
        "Camiseta M Azul - Camiseta de algodón azul de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra119 = addKeyword(["Comprar 100id:40"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 40,
      cantidad: 100,
      precio: 9.99,
      total: 9.99,
      prenda_descripcion:
        "Camiseta M Azul - Camiseta de algodón azul de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra120 = addKeyword(["Comprar 200id:40"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 40,
      cantidad: 200,
      precio: 9.99,
      total: 9.99,
      prenda_descripcion:
        "Camiseta M Azul - Camiseta de algodón azul de alta calidad."
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);
const compra121 = addKeyword(["Comprar 50 id:41"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 41,
      cantidad: 50,
      precio: 15.99,
      total: 15.99,
      prenda_descripcion: "Sudadera L Gris - Sudadera con capucha"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra122 = addKeyword(["Comprar 100id:41"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 41,
      cantidad: 100,
      precio: 15.99,
      total: 15.99,
      prenda_descripcion: "Sudadera L Gris - Sudadera con capucha"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const compra123 = addKeyword(["Comprar 200id:41"],{ matchExactly: true }).addAnswer(
  "Cargando pedido...",
  { capture: false },
  async (ctx, { flowDynamic }) => {
    const pedidoData = {
      user_id: 1,
      prenda_id: 41,
      cantidad: 200,
      precio: 15.99,
      total: 15.99,
      prenda_descripcion: "Sudadera L Gris - Sudadera con capucha"
    };

    try {
      const response = await axios.post(
        "https://challenge-api-ab2dc7622fc1.herokuapp.com/api/pedidos",
        pedidoData
      );

      if (response.status === 200 || response.status === 201) {
        await flowDynamic("¡Pedido realizado con éxito!");
      } else {
        await flowDynamic("Hubo un problema al procesar el pedido.");
      }
    } catch (error) {
      console.error(
        "Error en el POST:",
        error.response ? error.response.data : error.message
      );
      await flowDynamic(
        "Hubo un problema al realizar el pedido. Por favor, intenta nuevamente."
      );
    }
  }
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const askOpenAI = async (question) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: question }],
    });

    // Procesa la respuesta de OpenAI
    const answer = response.choices[0]?.message.content;
    return answer;
  } catch (error) {
    console.error("Error with OpenAI API:", error);
    return "Lo siento, ocurrió un error al procesar tu solicitud.";
  }
};

// Flujo para manejar preguntas cuando el bot no tiene respuesta
const defaultResponseFlow = addKeyword("default")
  .addAnswer(
    "Lo siento, no entiendo tu pregunta. ¿Quieres preguntarle a OpenAI?",
    { capture: true }
  )
  .addAction(async (ctx, { flowDynamic }) => {
    const question = ctx.body.trim();
    const openAIResponse = await askOpenAI(question);
    await flowDynamic(openAIResponse);
  });

// Flujo de conversación principal con una respuesta por defecto
const mainFlow = addKeyword("start")
  .addAnswer("¡Hola! ¿En qué puedo ayudarte hoy?", { capture: true })
  .addAction(async (ctx, { flowDynamic }) => {
    const message = ctx.body.trim();

    // Si no hay un flujo que coincida, se dirige a OpenAI
    if (!ctx.state || !ctx.state.flow) {
      ctx.state = ctx.state || {}; // Inicializar ctx.state si no existe
      ctx.state.flow = true; // Establecer un valor predeterminado para flow
      const openAIResponse = await askOpenAI(message);
      await flowDynamic(openAIResponse);
    }
  });
const generateOpenAIResponse = async (prompt) => {
  try {
    const response = await openai.completions.create({
      model: "text-davinci-003", // o el modelo que prefieras
      prompt: prompt,
      max_tokens: 100,
      temperature: 0.7,
    });

    return response.choices[0].text.trim();
  } catch (error) {
    console.error("Error al generar la respuesta de OpenAI:", error);
    return "Lo siento, hubo un problema al generar una respuesta.";
  }
};
const main = async () => {
  // Agregar el flujo dataFlow junto con los demás
  const adapterFlow = createFlow([
    welcomeFlow,
    registerFlow,
    viewRegisterFlow,
    dataFlow,
    dataFaldas,
    editRegisterFlow,
    dataCarrito,
    compra1,
    compra2,
    compra3,
    compra4,
    compra5,
    compra6,
    compra7,
    compra8,
    compra9,
    compra10,
    compra11,
    compra12,
    compra13,
    compra14,
    compra15,
    compra16,
    compra17,
    compra18,
    compra19,
    compra20,
    compra21,
    compra22,
    compra23,
    compra24,
    compra25,
    compra26,
    compra27,
    compra28,
    compra29,
    compra30,
    compra31,
    compra32,
    compra33,
    compra34,
    compra35,
    compra36,
    compra37,
    compra38,
    compra39,
    compra40,
    compra41,
    compra42,
    compra43,
    compra44,
    compra45,
    compra46,
    compra47,
    compra48,
    compra49,
    compra50,
    compra51,
    compra52,
    compra53,
    compra54,
    compra55,
    compra56,
    compra57,
    compra58,
    compra59,
    compra60,
    compra61,
    compra62,
    compra63,
    compra64,
    compra65,
    compra66,
    compra67,
    compra68,
    compra69,
    compra70,
    compra71,
    compra72,
    compra73,
    compra74,
    compra75,
    compra76,
    compra77,
    compra78,
    compra79,
    compra80,
    compra81,
    compra82,
    compra83,
    compra84,
    compra85,
    compra86,
    compra87,
    compra88,
    compra89,
    compra90,
    compra91,
    compra92,
    compra93,
    compra94,
    compra95,
    compra96,
    compra97,
    compra98,
    compra99,
    compra100,
    compra101,
    compra102,
    compra103,
    compra104,
    compra105,
    compra106,
    compra107,
    compra108,
    compra109,
    compra110,
    compra111,
    compra112,
    compra113,
    compra114,
    compra115,
    compra116,
    compra117,
    compra118,
    compra119,
    compra120,
    compra121,
    compra122,
    compra123,
    defaultResponseFlow, // Agregar flujo de respuesta por defecto
    mainFlow,
    dataCamisas,
    dataChaqueta,
    dataSudadera,
  ]);

  const adapterProvider = createProvider(Provider, {
    jwtToken: process.env.JWT_TOKEN,
    numberId: process.env.NUMBER_ID,
    verifyToken: process.env.VERIFY_TOKEN,
    version: process.env.API_VERSION,
  });

  // Verificar si los valores de los tokens están correctamente configurados
  console.log("JWT Token:", process.env.JWT_TOKEN);
  console.log("Number ID:", process.env.NUMBER_ID);
  console.log("Verify Token:", process.env.VERIFY_TOKEN);
  console.log("API Version:", process.env.API_VERSION);

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  });

  adapterProvider.server.post(
    "/v1/messages",
    handleCtx(async (bot, req, res) => {
      const { number, message, urlMedia } = req.body;
      await bot.sendMessage(number, message, { media: urlMedia ?? null });
      return res.end("sent");
    })
  );

  adapterProvider.server.post(
    "/v1/register",
    handleCtx(async (bot, req, res) => {
      const { number, name } = req.body;
      await bot.dispatch("REGISTER_FLOW", { from: number, name });
      return res.end("trigger");
    })
  );

  adapterProvider.server.post(
    "/v1/samples",
    handleCtx(async (bot, req, res) => {
      const { number, name } = req.body;
      await bot.dispatch("SAMPLES", { from: number, name });
      return res.end("trigger");
    })
  );

  adapterProvider.server.post(
    "/v1/blacklist",
    handleCtx(async (bot, req, res) => {
      const { number, intent } = req.body;
      if (intent === "remove") bot.blacklist.remove(number);
      if (intent === "add") bot.blacklist.add(number);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "ok", number, intent }));
    })
  );

  httpServer(+PORT);
};


main();
