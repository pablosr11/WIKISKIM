import { saveAs } from "file-saver";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { Inter } from "next/font/google";

import JSZip from "jszip";

const inter = Inter({ subsets: ["latin"] });
const wikipediaUrlPattern = new RegExp(
  "^https:\\/\\/(?:[a-z]+\\.)?wikipedia\\.org\\/wiki\\/[\\w\\-]+$"
);

export default function Home() {
  async function getWikipediaHtml(url: URL): Promise<string> {
    var zip = new JSZip();
    const apiUrl = new URL("https://en.wikipedia.org/w/api.php");
    const title = url.pathname.split("/").pop();
    if (!title) throw new Error("missing title");

    apiUrl.search = new URLSearchParams({
      action: "parse",
      format: "json",
      prop: "text",
      page: decodeURIComponent(title),
      origin: "*",
    }).toString();

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(
        `HTTP error! Status: ${response.status}, ${response.statusText}, ${apiUrl}`
      );
    }
    const data = await response.json();
    const page = data.parse;

    // parse the html
    const parser = new DOMParser();
    const doc = parser.parseFromString(page.text["*"], "text/html");

    // remove all images
    doc.querySelectorAll("img, style").forEach((el) => el.remove());

    // remove all css classes
    doc.querySelectorAll("*").forEach((el) => {
      el.removeAttribute("class");
    });

    // remove links with : any time after /wiki/
    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (href && href.includes("/wiki/")) {
        const parts = href.split(":");
        if (parts.length > 1) {
          el.remove();
        }
      }
    });

    // urldecode all links
    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (href) {
        el.setAttribute("href", decodeURIComponent(href));
      }
    });

    // remove all links except the ones for /wiki/ pages
    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (href && (!href.includes("/wiki/") || href.includes("File:"))) {
        el.remove();
      }
    });

    // remove all comments and multiline comments
    doc.querySelectorAll("body").forEach((el) => {
      el.innerHTML = el.innerHTML.replace(/<!--[\s\S]*?-->/g, "");
    });

    // compress the whitespace in the html
    doc.querySelectorAll("body").forEach((el) => {
      el.innerHTML = el.innerHTML.replace(/\s+/g, " ");
    });

    // download the html of all linked pages
    const links = doc.querySelectorAll("a");

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = link.getAttribute("href");
      if (href && href.includes("/wiki/")) {
        const url = new URL(href, "https://en.wikipedia.org");
        const title = url.pathname.split("/").pop();
        if (!title) throw new Error("missing title");

        const apiUrl = new URL("https://en.wikipedia.org/w/api.php");
        apiUrl.search = new URLSearchParams({
          action: "parse",
          format: "json",
          prop: "text",
          redirect: "true",
          page: title, //
          origin: "*",
        }).toString();

        const response = await fetch(apiUrl);

        // sleep 0.2 - 1 seconds
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 800 + 200)
        );
        if (!response.ok) {
          throw new Error(
            `HTTP error! Status: ${response.status}, ${response.statusText}, ${apiUrl}`
          );
        }

        const data = await response.json();
        const page = data.parse;

        if (!page) {
          continue;
        }

        // parse the html
        const parser = new DOMParser();
        const doc = parser.parseFromString(page.text["*"], "text/html");

        // remove all images
        doc.querySelectorAll("img, style").forEach((el) => el.remove());

        // remove all css classes
        doc.querySelectorAll("*").forEach((el) => {
          el.removeAttribute("class");
        });

        // remove all targets from all links
        doc.querySelectorAll("a").forEach((el) => {
          el.removeAttribute("target");
        });

        const blob = new Blob([doc.documentElement.innerHTML], {
          type: "text/html",
        });

        zip.folder("wiki")?.file(`${title}.html`, blob);
      }
    }

    // add a "./" prefix to all links that contain /wiki/
    doc.querySelectorAll("a").forEach((el) => {
      const href = el.getAttribute("href");
      if (href && href.includes("/wiki/")) {
        el.setAttribute("href", `./${href}.html`);
      }
    });

    const blob = new Blob([doc.documentElement.innerHTML], {
      type: "text/html",
    });

    zip.file(`${title}.html`, blob);

    const content = await zip.generateAsync({ type: "blob" });

    saveAs(content, `${title}.zip`);

    return blob;
  }

  async function isValidWikipediaUrl(urlString: string): Promise<boolean> {
    return !!wikipediaUrlPattern.test(urlString);
  }

  return (
    <main
      className={`flex w-full flex-col items-center space-y-4 p-32 ${inter.className}`}
    >
      <h1>read the whole article offline</h1>
      <Formik
        initialValues={{ wikiUrl: "" }}
        onSubmit={async (values, { setSubmitting }) => {
          if (await isValidWikipediaUrl(values.wikiUrl)) {
            const url = new URL(values.wikiUrl);
            await getWikipediaHtml(url);
          } else {
            alert("invalid wikipedia url");
          }
          setSubmitting(false);
        }}
      >
        {({ isSubmitting, handleSubmit }) => (
          <Form
            className={"w-fit space-x-2"}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSubmit();
              }
            }}
          >
            {isSubmitting && (
              <svg
                className="... mr-3 h-5 w-5 animate-spin"
                viewBox="0 0 24 24"
              ></svg>
            )}
            <Field
              className={"border border-slate-500 p-1 "}
              type="text"
              name="wikiUrl"
              validate={(value: any) => {
                if (!value) {
                  return "missing wikipedia url";
                }
                if (!wikipediaUrlPattern.test(value)) {
                  return "invalid wikipedia url";
                }
              }}
            />
            <button
              className={
                "rounded-md p-1 shadow-md shadow-slate-500 transition-shadow"
              }
              type="submit"
              disabled={isSubmitting}
            >
              download
            </button>
            <ErrorMessage name="wikiUrl" component="div" />
          </Form>
        )}
      </Formik>
      <p>
        simply enter a wikipedia url and we will download its contents and links
        so you can read the full thing offline
      </p>
      <p>
        build by{" "}
        <a target="_blank" href="https://twitter.com/psiesta11">
          psiesta11
        </a>
      </p>
      <a className={"animate-bounce"} href="#">
        buy me un cafe
      </a>
    </main>
  );
}
