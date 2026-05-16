import { FoliateVaultPublicationParser } from "../FoliateVaultPublicationParser";

describe("FoliateVaultPublicationParser stylesheet normalization", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("inlines blob stylesheets into style tags instead of data URLs", async () => {
		const parser = new FoliateVaultPublicationParser({} as any);
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const href = String(input);
			if (href === "blob:chapter.css") {
				return new Response(
					'@import "blob:nested.css"; @import url("https://fonts.googleapis.com/css2?family=Noto+Sans"); body { color: red; }',
					{ status: 200 }
				);
			}
			if (href === "blob:nested.css") {
				return new Response("p { margin: 0; }", { status: 200 });
			}
			throw new Error(`Unexpected fetch for ${href}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const transformed = await (parser as any).inlineFoliateBlobStylesheets(
			`<html xmlns="http://www.w3.org/1999/xhtml">
				<head>
					<link rel="stylesheet" href="blob:chapter.css" media="screen"/>
					<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"/>
				</head>
				<body><p>hello</p></body>
			</html>`,
			"application/xhtml+xml"
		);

		expect(transformed).not.toContain("data:text/css");
		expect(transformed).not.toContain("fonts.googleapis.com");

		const doc = new DOMParser().parseFromString(transformed, "application/xhtml+xml");
		expect(doc.querySelectorAll('link[rel~="stylesheet"]').length).toBe(0);

		const inlineStyle = doc.querySelector('style[data-weave-inline-stylesheet="true"]');
		expect(inlineStyle).toBeTruthy();
		expect(inlineStyle?.getAttribute("media")).toBe("screen");
		expect(inlineStyle?.textContent).toContain("body { color: red; }");
		expect(inlineStyle?.textContent).toContain("p { margin: 0; }");
		expect(inlineStyle?.textContent).not.toContain("@import");
	});

	it("strips remote font sources from existing style elements", async () => {
		const parser = new FoliateVaultPublicationParser({} as any);
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const href = String(input);
			if (href === "blob:theme.css") {
				return new Response("h1 { letter-spacing: 0.1em; }", { status: 200 });
			}
			throw new Error(`Unexpected fetch for ${href}`);
		});
		vi.stubGlobal("fetch", fetchMock);

		const transformed = await (parser as any).inlineFoliateBlobStylesheets(
			`<html>
				<head>
					<style>
						@import url("blob:theme.css");
						@font-face {
							font-family: "RemoteFont";
							src: url("https://fonts.gstatic.com/s/remotefont.woff2") format("woff2"), local("Arial");
						}
						body { font-family: "RemoteFont", serif; }
					</style>
				</head>
				<body><h1>hello</h1></body>
			</html>`,
			"text/html"
		);

		expect(transformed).not.toContain("fonts.gstatic.com");

		const doc = new DOMParser().parseFromString(transformed, "text/html");
		const style = doc.querySelector("style");
		expect(style?.textContent).toContain('local("Arial")');
		expect(style?.textContent).toContain("h1 { letter-spacing: 0.1em; }");
		expect(style?.textContent).not.toContain("https://");
	});

	it("removes scripted epub content while preserving readable markup", async () => {
		const parser = new FoliateVaultPublicationParser({} as any);

		const transformed = await (parser as any).inlineFoliateBlobStylesheets(
			`<html>
				<head>
					<meta http-equiv="refresh" content="0;url=javascript:alert('x')">
					<script>alert('x')</script>
				</head>
				<body onload="alert('x')">
					<a href="javascript:alert('x')" onclick="alert('x')">bad link</a>
					<iframe src="https://example.com/embed"></iframe>
					<object data="movie.swf"></object>
					<p>safe text</p>
				</body>
			</html>`,
			"text/html"
		);

		const doc = new DOMParser().parseFromString(transformed, "text/html");
		expect(doc.querySelector("script")).toBeNull();
		expect(doc.querySelector("iframe")).toBeNull();
		expect(doc.querySelector("object")).toBeNull();
		expect(doc.querySelector('meta[http-equiv="refresh"]')).toBeNull();
		expect(doc.body.getAttribute("onload")).toBeNull();
		expect(doc.querySelector("a")?.getAttribute("href")).toBeNull();
		expect(doc.querySelector("a")?.getAttribute("onclick")).toBeNull();
		expect(doc.querySelector("p")?.textContent).toBe("safe text");
	});
});
