import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ofertasRouter from "./ofertas";
import rankingRouter from "./ranking";
import adminRouter from "./admin";
import usuariosRouter from "./usuarios";
import alertasRouter from "./alertas";
import historicoRouter from "./historico";
import favoritosRouter from "./favoritos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(adminRouter);
router.use(ofertasRouter);
router.use(rankingRouter);
router.use(usuariosRouter);
router.use(alertasRouter);
router.use(historicoRouter);
router.use(favoritosRouter);

export default router;
