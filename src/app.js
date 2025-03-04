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

dotenv.config(); // Cargar las variables de entorno

const PORT = process.env.PORT ?? 3008;

// Configuración de la base de datos
const adapterDB = new Database({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: +process.env.DB_PORT,
});

// Flujo para documentación
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
const welcomeFlow = addKeyword(["Hola", "Buenas"])
  .addAnswer("🙌 Hola! Soy Cami la asistente")
  .addAnswer(
    [
      'Si quieres hacer un pedido o consultar precios y stock por favor escribe "inventario". También puedes buscar: \n' +
        '🧥 Faldas con "Falda", \n👚 Camisas con "Camisa", \n👕 Sudaderas con "Sudadera", \n🧥 Chaquetas con "Chaqueta".',
    ].join("\n"),
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
    await flowDynamic(
      `Gracias por tu información! Aquí está tu registro:\n\n` +
        `👤 Nombre: ${state.get("name")}\n🏢 Negocio: ${state.get(
          "businessName"
        )}\n` +
        `📍 Dirección: ${state.get("businessAddress")}`
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
        `¿Te gustaría editar tu registro? Responde con *editar* para actualizar tu información.`
    );
  }
);

// Aquí debes definir otro flujo para gestionar la edición del registro
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

      // Guardamos las prendas en el contexto y reiniciamos el carrito
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
  "compra",
  "ver compra",
]).addAnswer(
  "Cargando el carrito para ti...",
  { capture: false },
  async (ctx, { flowDynamic, state }) => {
    const name = state.get("name") ?? "No registrado";
    const businessName = state.get("businessName") ?? "No registrado";
    const businessAddress = state.get("businessAddress") ?? "No registrado";

    // Asegúrate de obtener el carrito antes de mostrar el flujo
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

const main = async () => {
  // Agregar el flujo dataFlow junto con los demás
  const adapterFlow = createFlow([
    welcomeFlow,
    registerFlow,
    viewRegisterFlow,
    dataFlow,
    editRegisterFlow,
    dataCarrito,
  ]);

  const adapterProvider = createProvider(Provider, {
    jwtToken: process.env.JWT_TOKEN,
    numberId: process.env.NUMBER_ID,
    verifyToken: process.env.VERIFY_TOKEN,
    version: process.env.API_VERSION,
  });

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
