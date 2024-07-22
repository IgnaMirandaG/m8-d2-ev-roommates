import express from 'express';
import { v4 as uuid } from 'uuid';
import cors from 'cors';
import fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

//MIDDLEWARES:
app.use(cors());
app.use(express.json())

//iniciar el servidor
app.listen(3000, () => {
    console.log("Servidor escuchando en http://localhost:3000");
});

//ENDPOINTS:

//ruta principal -> archivo HTML
app.get("/", (req, res) => {
    res.sendFile(path.resolve(__dirname, "./public/index.html"));
});

//ruta para obtener todos los roommates
app.get("/roommates", (req, res) => {
    try {
        let roommates = fs.readFileSync(path.resolve(__dirname, "./data/roommates.json"), "utf8");
        roommates = JSON.parse(roommates);
        res.json({ roommates });
    } catch (error) {
        res.status(500).json({
            message: "Error al intentar obtener los datos de roommates"
        })
    }
});

//ruta POST /roommate para registrar un nuevo roommate random
app.post("/roommate", async (req, res) => {
    try {
        //obtener un usuario de api
        let response = await fetch("https://randomuser.me/api");
        let data = await response.json();
        let usuarioApi = data.results[0];

        //crear nuevo usuario con los datos obtenidos
        let nuevoUsuario = {
            id: uuid().slice(0, 6),
            nombre: `${usuarioApi.name.first} ${usuarioApi.name.last}`,
            debe: 0,
            recibe: 0,
            email: usuarioApi.email
        };

        //leer los usuarios existentes
        let roommates = fs.readFileSync(path.resolve(__dirname, "./data/roommates.json"), "utf8");
        roommates = JSON.parse(roommates);

        //agregar el nuevo usuario
        roommates.push(nuevoUsuario);

        //guardar los cambios
        fs.writeFileSync(path.resolve(__dirname, "./data/roommates.json"), JSON.stringify(roommates, null, 2), "utf-8");

        //recalcular las cuentas
        divirCuentas();

        res.status(201).json({
            message: "Roommate agregado con éxito",
            roommate: nuevoUsuario
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "No fue posible crear al nuevo usuario."
        })
    }
});

//ruta para obtener todos los gastos
app.get("/gastos", (req, res) => {
    try {
        let gastos = fs.readFileSync(path.resolve(__dirname, "./data/gastos.json"), "utf8");
        gastos = JSON.parse(gastos);
        res.json({ gastos });
    } catch (error) {
        res.status(500).json({
            message: "Error al intentar obtener los gastos"
        })
    }
});

//ruta para agregar un nuevo gasto
app.post("/gasto", async (req, res) => {
    try {
        let { roommate, descripcion, monto } = req.body;

        if (!roommate || !descripcion || !monto || isNaN(monto) || monto <= 0) {
            return res.status(400).json({
                message: "Datos inválidos. Asegúrese de proporcionar un roommate, descripción y un monto positivo."
            })
        }

        let gastos = fs.readFileSync(path.resolve(__dirname, "./data/gastos.json"), "utf8");
        gastos = JSON.parse(gastos);

        let nuevoGasto = {
            id: uuid().slice(0, 6),
            roommate,
            descripcion,
            monto
        }

        gastos.push(nuevoGasto);

        fs.writeFileSync(path.resolve(__dirname, "./data/gastos.json"), JSON.stringify(gastos, null, 2), "utf-8");

        divirCuentas();

        //enviar correo a todos los roommates
        // await enviarCorreoNuevoGasto(nuevoGasto);

        res.status(201).json({
            message: "Gasto agregado con éxito",
            gasto: nuevoGasto
        });
    } catch (error) {
        console.log('Error al agregar gasto:', error);
        res.status(500).json({
            message: "Error interno del servidor al intentar agregar el gasto"
        })
    }
});

//ruta para eliminar un gasto
app.delete("/gasto", (req, res) => {
    try {
        let { id } = req.query;

        if (!id) {
            return res.status(400).json({
                message: "Debe proporcionar un id válido."
            })
        };

        let gastos = fs.readFileSync(path.resolve(__dirname, "./data/gastos.json"), "utf8");
        gastos = JSON.parse(gastos);

        let indexGasto = gastos.findIndex(gasto => gasto.id == id);

        if (indexGasto == -1) {
            return res.status(404).json({
                message: "Gasto no encontrado."
            });
        }

        gastos.splice(indexGasto, 1);

        fs.writeFileSync(path.resolve(__dirname, "./data/gastos.json"), JSON.stringify(gastos, null, 2), "utf-8");

        divirCuentas();

        res.json({
            message: "Gasto eliminado correctamente."
        });
    } catch (error) {
        res.status(500).json({
            message: "Error al intentar eliminar el gasto"
        })
    }
});

//ruta para actualizar un gasto
app.put("/gasto", (req, res) => {
    try {
        let { roommate, descripcion, monto } = req.body;
        let { id } = req.query;

        if (!roommate || !descripcion || !monto || !id || isNaN(monto) || monto <= 0){
            return res.status(400).json({
                message: "Debe proporcionar todos los datos requeridos para editar el gasto."
            })
        }

        let gastos = fs.readFileSync(path.resolve(__dirname, "./data/gastos.json"), "utf8");
        gastos = JSON.parse(gastos);

        let gastoFound = gastos.find(gasto => gasto.id == id);

        if (!gastoFound) {
            return res.status(404).json({
                message: "Gasto no encontrado."
            });
        };

        gastoFound.roommate = roommate;
        gastoFound.descripcion = descripcion;
        gastoFound.monto = monto

        fs.writeFileSync(path.resolve(__dirname, "./data/gastos.json"), JSON.stringify(gastos, null, 2), "utf-8");

        divirCuentas();

        res.json({
            message: "Gasto actualizado con éxito",
            gasto: gastoFound
        });
    } catch (error) {
        res.status(500).json({
            message: "Error al intentar actualizar el gasto"
        })
    }
});

//función para limpiar las deudas de los roommates
const limpiarDeudas = () => {
    let arrayRoommates = fs.readFileSync(path.resolve(__dirname, "./data/roommates.json"), "utf8");
    arrayRoommates = JSON.parse(arrayRoommates);

    for (const roommate of arrayRoommates) {
        roommate.debe = 0;
        roommate.recibe = 0;
    }

    fs.writeFileSync(path.resolve(__dirname, "./data/roommates.json"), JSON.stringify(arrayRoommates, null, 2), "utf-8");
}

//función para calcular y dividir las cuentas entre los roommates
const divirCuentas = () => {
    limpiarDeudas();
    let arrayGastos = fs.readFileSync(path.resolve(__dirname, "./data/gastos.json"), "utf8");
    arrayGastos = JSON.parse(arrayGastos);

    let arrayRoommates = fs.readFileSync(path.resolve(__dirname, "./data/roommates.json"), "utf8");
    arrayRoommates = JSON.parse(arrayRoommates);

    for (const gasto of arrayGastos) {
        let monto = Number(gasto.monto);
        let cuota = Number((monto / arrayRoommates.length).toFixed(2));

        for (const roommate of arrayRoommates) {
            if (gasto.roommate == roommate.nombre) {
                roommate.recibe += monto - cuota
            } else {
                roommate.debe += cuota;
            }
        }
    };

    fs.writeFileSync(path.resolve(__dirname, "./data/roommates.json"), JSON.stringify(arrayRoommates, null, 2), "utf-8");
};

//función para enviar correo cuando se registra un nuevo gasto ---> CODIGO PARCIAL, AÚN TRABAJANDO
// const enviarCorreoNuevoGasto = async (gasto) => {
//     //configuración del transporter 
//     let transporter = nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//             user: "",
//             pass: "",
//         },
//         tls: {
//             rejectUnauthorized: false,
//         },
//     });

//     //leer los roommates para obtener sus correos
//     let roommates = fs.readFileSync(path.resolve(__dirname, "./data/roommates.json"), "utf8");
//     roommates = JSON.parse(roommates);
//     let correos = roommates.map(r => r.email);

//     //enviar el correo
//     let info = await transporter.sendMail({
//         from: '"Aplicación Roommates" <noreply@roommates.com>',
//         to: correos.join(", "),
//         subject: "Nuevo gasto registrado",
//         text: `Se ha registrado un nuevo gasto:
//                Roommate: ${gasto.roommate}
//                Descripción: ${gasto.descripcion}
//                Monto: ${gasto.monto}`,
//         html: `<h1>Nuevo gasto registrado</h1>
//                <p><strong>Roommate:</strong> ${gasto.roommate}</p>
//                <p><strong>Descripción:</strong> ${gasto.descripcion}</p>
//                <p><strong>Monto:</strong> ${gasto.monto}</p>`
//     });

//     console.log(`Correo enviado: ${info.messageId}`);
// }