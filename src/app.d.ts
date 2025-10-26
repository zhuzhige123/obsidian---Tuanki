// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

// Svelte component type declarations
declare module "*.svelte" {
	import type { ComponentType, SvelteComponent } from "svelte";
	const component: ComponentType<SvelteComponent>;
	export default component;
}

export {};
