import app from '@adonisjs/core/services/app';
let ai;
await app.booted(async () => {
    ai = await app.container.make('ai');
});
export { ai as default };
//# sourceMappingURL=main.js.map