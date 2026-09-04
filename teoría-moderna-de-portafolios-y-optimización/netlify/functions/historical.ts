import { Handler } from '@netlify/functions';

export const handler: Handler = async (event, context) => {
  try {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ status: "ok", message: "Datos cargados correctamente" })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno del servidor" })
    };
  }
};
