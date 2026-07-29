import { csrfToken } from "@/lib/auth/csrf"; import { WebsiteForm } from "@/components/website-form"; import { createWebsite } from "../actions";
export default async function NewWebsite(){return <><h1>Add website</h1><WebsiteForm csrf={await csrfToken()} action={createWebsite}/></>}
