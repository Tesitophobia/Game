/* ==========================================================================
   AFTERSHOCK / ART.JS
   Sprites y dibujo pixel-art. Si quieres cambiar la apariencia de personajes,
   reemplaza assets/character-sprites.png manteniendo la cuadrícula de 32x48.
   No contiene reglas de movimiento ni colisiones.
   ========================================================================== */
(() => {
  "use strict";

  const sheet = new Image();
  const scriptUrl = document.currentScript && document.currentScript.src;
  sheet.src = scriptUrl
    ? new URL("../assets/character-sprites.png", scriptUrl).href
    : "assets/character-sprites.png";
  sheet.onload = () => {
    sheet.dataset.ready = "true";
    window.dispatchEvent(new Event("aftershock-art-ready"));
  };

  const CELL_W = 32;
  const CELL_H = 48;

  function drawHero(ctx, player, cameraY, hasHelmet, elapsed) {
    const x = Math.round(player.x);
    const y = Math.round(player.y - cameraY);
    const moving = Math.abs(player.vx) > 1;
    const frame = player.duck ? 3 : moving ? (Math.floor(player.anim * 2) % 2) + 1 : 0;

    ctx.fillStyle = "#07101899";
    ctx.fillRect(x + 5, y + player.h - 2, player.w - 8, 5);

    if (sheet.complete && sheet.naturalWidth) {
      ctx.drawImage(
        sheet,
        frame * CELL_W, 0, CELL_W, CELL_H,
        x - 5, y - 2, player.w + 10, player.h + 5
      );
    } else {
      // Silueta de reserva mientras termina de cargar el atlas.
      ctx.fillStyle = "#b74f42";
      ctx.fillRect(x + 12, y + 20, player.w - 24, player.h - 24);
      ctx.fillStyle = "#c78d70";
      ctx.fillRect(x + 16, y + 5, 18, 18);
    }

    if (hasHelmet) {
      const helmetY = y + (player.duck ? 14 : -1);
      ctx.fillStyle = "#815b2c";
      ctx.fillRect(x + 13, helmetY + 7, 27, 7);
      ctx.fillStyle = "#dba74e";
      ctx.fillRect(x + 16, helmetY + 1, 21, 9);
      ctx.fillStyle = "#f4d58b";
      ctx.fillRect(x + 20, helmetY, 13, 4);
      ctx.fillStyle = "#fff0bd";
      ctx.fillRect(x + 20, helmetY + 2, 5, 2);
    }

    return { x, y };
  }

  function drawCivilian(ctx, civilian, index, cameraY) {
    const x = Math.round(civilian.x);
    const y = Math.round(civilian.y - cameraY);
    if (y < -60 || y > 650) return;

    const frame = index % 2;
    ctx.fillStyle = "#07101899";
    ctx.fillRect(x - 12, y - 2, 25, 4);

    if (sheet.complete && sheet.naturalWidth) {
      ctx.drawImage(
        sheet,
        frame * CELL_W, CELL_H, CELL_W, CELL_H,
        x - 17, y - 48, 34, 50
      );
    } else {
      ctx.fillStyle = "#557889";
      ctx.fillRect(x - 10, y - 28, 20, 28);
      ctx.fillStyle = "#c78d70";
      ctx.fillRect(x - 6, y - 42, 12, 12);
    }

    if (civilian.done) {
      ctx.fillStyle = "#9bc4a6";
      ctx.fillRect(x + 15, y - 39, 18, 17);
      ctx.fillStyle = "#0e1a1e";
      ctx.font = "bold 12px monospace";
      ctx.fillText("✓", x + 20, y - 26);
    } else {
      ctx.fillStyle = "#e9bd70";
      ctx.fillRect(x - 4, y - 57, 8, 11);
      ctx.fillStyle = "#17222a";
      ctx.font = "bold 10px monospace";
      ctx.fillText("!", x - 2, y - 48);
    }
  }

  function drawPickup(ctx, item, cameraY, elapsed) {
    const frame = item.type === "helmet" ? 2 : 3;
    const x = Math.round(item.x);
    const y = Math.round(item.y - cameraY + Math.sin(item.bob) * 3);

    ctx.fillStyle = "#101820";
    ctx.fillRect(x - 18, y - 18, 36, 36);

    if (sheet.complete && sheet.naturalWidth) {
      ctx.drawImage(
        sheet,
        frame * CELL_W, CELL_H, CELL_W, CELL_H,
        x - 24, y - 29, 48, 58
      );
    } else if (item.type === "helmet") {
      ctx.fillStyle = "#dba74e";
      ctx.fillRect(x - 12, y - 5, 24, 10);
      ctx.fillRect(x - 8, y - 12, 16, 8);
    } else {
      ctx.fillStyle = "#e9e2ca";
      ctx.fillRect(x - 12, y - 13, 24, 26);
      ctx.fillStyle = "#e16e50";
      ctx.fillRect(x - 3, y - 9, 6, 18);
      ctx.fillRect(x - 9, y - 3, 18, 6);
    }
    ctx.fillStyle = "#fff0bd";
    ctx.fillRect(x + 13, y - 15, 3, 3);
  }

  window.AFTERSHOCK_ART = {
    drawHero,
    drawCivilian,
    drawPickup,
    atlas: sheet
  };
})();
