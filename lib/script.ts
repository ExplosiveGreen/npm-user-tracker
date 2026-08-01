const fetch_npm_user_data = async (npm_user: string) => {
    const author_req = await fetch(`https://registry.npmjs.org/-/v1/search?text=author:${npm_user}`)
    const maintainer_req = await fetch(`https://registry.npmjs.org/-/v1/search?text=maintainer:${npm_user}`)

}
console.log("script")