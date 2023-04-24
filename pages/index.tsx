import { Inter } from "next/font/google";

// edge runtime

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <main
      className={`flex w-full flex-col items-center space-y-4 p-32 ${inter.className}`}
    >
      <h1>read the whole article offline</h1>
      <input
        className={"w-full border border-slate-500"}
        type="text"
        id="wikiArticle"
        placeholder="https://wikipedia.org/wiki/mango"
      />
      <button className={"p-2 shadow shadow-black"}>download</button>
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
