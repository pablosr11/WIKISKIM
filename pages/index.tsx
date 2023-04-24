import { ErrorMessage, Field, Form, Formik } from "formik";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  return (
    <main
      className={`flex w-full flex-col items-center space-y-4 p-32 ${inter.className}`}
    >
      <h1>read the whole article offline</h1>
      <Formik
        initialValues={{ wikiUrl: "" }}
        onSubmit={(values, { setSubmitting }) => {
          setTimeout(() => {
            alert(JSON.stringify(values, null, 2));
            setSubmitting(false);
          }, 400);
        }}
      >
        {({ isSubmitting }) => (
          <Form className={"space-x-2"}>
            <Field
              className={"border border-slate-500 p-1 "}
              type="text"
              name="wikiUrl"
              validate={(value: any) => {
                if (!value) {
                  return "missing a url";
                }
                if (!value.includes("wikipedia.org/wiki/")) {
                  return "invalid url";
                }
              }}
            />
            <ErrorMessage name="wikiUrl" component="div" />
            <button
              className={
                "rounded-md p-1 shadow-md shadow-slate-500 transition-shadow"
              }
              type="submit"
              disabled={isSubmitting}
            >
              download
            </button>
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
