import { ImageTools } from "./image-tools.js";
import { FusionHandler } from "./fusion-handler.js";
import pokemonList from "../resources/pokemonDictionary.json" assert { type: "json" };
import ResetDexApp from "./apps/reset-dex-app.js";

import ImageSelector from "./apps/image-selector.js";
import FusionSelector from "./apps/fusion-selector.js";

Handlebars.registerHelper('color', (url) => url.includes("japeal") ? "white" : "#e3fed2");

Hooks.on("init", () => {
    window.ImageSelector = ImageSelector;

    // Settings

    // Sprite Folder
    game.settings.register('ptr-fusion-maker', 'imageDirectory', {
        name: 'Image Directory',
        hint: "The directory to look for and create images in. If empty images will be made in PTR's default directory.",
        scope: 'world',
        config: true,
        type: String,
        default: "systems/ptu/static/images/sprites/"
    });

    // OpenAI Key
    /*
    game.settings.register('ptr-fusion-maker', 'openaiKey', {
        name: 'OpenAI Key',
        hint: 'Your OpenAI Key for generation. If blank this feature goes unused. Ensure that you and only you have access to these configuration settings. If your key leaks, its your fault.',
        scope: 'world',
        config: true,
        type: String,
        default: ""
    });
    */

    // Default Description
    game.settings.register('ptr-fusion-maker', 'defaultDescription', {
        name: 'Default Description',
        hint: 'The default description given in PokeDex entries for Fusion Pokemon.',
        scope: 'world',
        config: true,
        type: String,
        default: "This is a Fusion Pokemon."
    });

    // Current Dex Number
    game.settings.register('ptr-fusion-maker', 'dexNumberCurrent', {
        name: 'Current Dex Number',
        scope: 'world',
        config: false,
        type: Number,
        default: 6000
    });

    // Starting Dex Number
    game.settings.register('ptr-fusion-maker', 'dexNumber', {
        name: 'Starting Dex Number',
        hint: 'The PokeDex number that Fusion Pokemon will start at. Defaults to 6000, alter this if you have Pokemon going past this number. This will also reset the current active dex number when changed.',
        scope: 'world',
        config: true,
        type: Number,
        default: 6000,
        onChange: (value) => game.settings.set('ptr-fusion-maker', 'dexNumberCurrent', value)
    });

    game.settings.register("ptr-fusion-maker", "pokemonList", {
        name: "Pokemon List",
        scope: 'world',
        config: false,
        type: Object,
        default: pokemonList
    });

    ImageTools.getPageHTML(`${ImageTools.daenaURL}`)
        .then(html => game.settings.set("ptr-fusion-maker", "pokemonList", Object.assign({}, ...Array.from(html.querySelectorAll('main')).splice(2).slice(0, -1).map(e => ({[e.querySelector("h3").textContent]: parseInt(e.querySelector("a").textContent.substring(1))})))));

    // Get Dex

    // Modify PTU to make use of the directory if available.
    
    CONFIG.PTU.Item.documentClasses.species.prototype.getImagePath = async function ({ gender = game.i18n.localize("PTU.Male"), shiny = false, extension = game.settings.get("ptu", "generation.defaultImageExtension"), suffix = "" }={}) {
        let path = game.settings.get('ptr-fusion-maker', 'imageDirectory');
        const useName = game.settings.get("ptu", "generation.defaultPokemonImageNameType");
        const femaleTag = gender.toLowerCase() == "female" ? "f" : "";
        const shinyTag = shiny ? "s" : "";

        let fullPath = `${path.startsWith('/') ? "" : "/"}${path}${path.endsWith('/') ? "" : "/"}${useName ? this.slug : Handlebars.helpers.lpad(this.system.number, 3, 0)}${femaleTag}${shinyTag}${this.system.form ? ("_" + this.system.form) : ""}${suffix ?? ""}${extension.startsWith('.') ? "" : "."}${extension}`;
        let result = await fetch(fullPath);
        if (result.status != 404) return fullPath;

        path = game.settings.get("ptu", "generation.defaultImageDirectory");

        return `${path.startsWith('/') ? "" : "/"}${path}${path.endsWith('/') ? "" : "/"}${useName ? this.slug : Handlebars.helpers.lpad(this.system.number, 3, 0)}${femaleTag}${shinyTag}${this.system.form ? ("_" + this.system.form) : ""}${suffix ?? ""}${extension.startsWith('.') ? "" : "."}${extension}`;
    }
    
    game.ptu.species.generator.getImage = async function (species, { gender = game.i18n.localize("PTU.Male"), shiny = false, extension = game.settings.get("ptu", "generation.defaultImageExtension"), suffix = "" } = {}) {
        // Check for default
        let path = await species.getImagePath({ gender, shiny, extension, suffix });
        let result = await fetch(path)
        if (result.status != 404) return path;

        // Default with webp
        path = await species.getImagePath({ gender, shiny, extension: "webp", suffix });
        result = await fetch(path);
        if (result.status != 404) return path;

        // look for male images
        if (gender != game.i18n.localize("PTU.Male")) {
            // Check default with Male
            path = await species.getImagePath({ shiny, suffix });
            result = await fetch(path);
            if (result.status != 404) return path;

            // Male with webp
            path = await species.getImagePath({ shiny, extension: "webp", suffix });
            result = await fetch(path);
            if (result.status != 404) return path;
        }

        //look for non-shiny images
        if (shiny) {
            path = await species.getImagePath({ gender, suffix });
            result = await fetch(path)
            if (result.status != 404) return path;

            path = await species.getImagePath({ gender, extension: "webp", suffix });
            result = await fetch(path);
            if (result.status != 404) return path;

            //look for male non-shiny images
            if (gender != game.i18n.localize("PTU.Male")) {
                path = await species.getImagePath({ suffix });
                result = await fetch(path);
                if (result.status != 404) return path;
        
                path = await species.getImagePath({ extension: "webp", suffix });
                result = await fetch(path);
                if (result.status != 404) return path;
            }
        }

        //all again but ignoring the custom suffix
        if (suffix) return await this.getImage(species, {gender, shiny, extension});

        return undefined;
    }

    window.OpenFusionSelector = () => {
        new FusionSelector(game.settings.get("ptr-fusion-maker", "pokemonList")).render(true);
    }
    
});

function fuserDialogue () {
    let pkmn = game.settings.get("ptr-fusion-maker", "pokemonList");
    new FusionSelector(game.settings.get("ptr-fusion-maker", "pokemonList")).render(true);
}

Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) return; // Lock out non-players.
    const tokenControls = controls.find((c) => {
        return c.name === "token";
    });
    if (tokenControls && Object.prototype.hasOwnProperty.call(tokenControls, "tools")) {
        tokenControls.tools.push({
            button: true,
            name: "fuser",
            title: "Fuser",
            icon: "fas fa-arrows-spin",
            onClick: fuserDialogue
        });
    }
})

