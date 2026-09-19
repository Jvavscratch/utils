/*******************************************************************
* Copyright         : 2024 saaawdust
* File Name         : build-util.ts
* Description       : Util for compilation
*
* Revision History  :
* Date        Author          Comments
* ------------------------------------------------------------------
* 10/12/2025  NeuronPulse     Modified
/******************************************************************/

import { basename, dirname, join, parse } from "path";
import { Costume, Sound, Sprite } from "@jvavscratch/types";
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, statSync, unlinkSync } from "fs";
import { includes, uuid } from "@jvavscratch/types";
import { getBuildScratchDir } from "@jvavscratch/core";
const AdmZip = require("adm-zip");

export function createCostume({
    name = "default",
    path = "",
    bitmapResolution = 2,
    rotationCenterX = 0,
    rotationCenterY = 0,
} = {}): Costume {

    let newCostume: Costume = {
        name: name,
        bitmapResolution: bitmapResolution,
        dataFormat: "svg",
        assetId: "null",
        md5ext: "null",
        rotationCenterX: rotationCenterX,
        rotationCenterY: rotationCenterY,
    }

    const { ext, base } = parse(path);
    const newFilePath = join(getBuildScratchDir(), "tmp", "temp_project", base);

    copyFileSync(path, newFilePath);

    const uuidName = uuid(includes.scratch_alphanumeric);
    const uuidFullName = `${uuidName}${ext}`;
    const newFilePathWithUUID = join(getBuildScratchDir(), "tmp", "temp_project", uuidFullName);

    renameSync(newFilePath, newFilePathWithUUID);

    newCostume.assetId = uuidName;
    newCostume.md5ext = uuidFullName;
    newCostume.dataFormat = ext.slice(1); // Remove the leading dot

    return newCostume;
}

export function createSound({
    name = "default",
    path = "",
} = {}): Sound {

    let newSound: Sound = {
        name: name,
        dataFormat: "mp3",
        assetId: "null",
        md5ext: "null",
    }

    const { ext, base } = parse(path);
    const newFilePath = join(getBuildScratchDir(), "tmp", "temp_project", base);

    copyFileSync(path, newFilePath);

    const uuidName = uuid(includes.scratch_alphanumeric);
    const uuidFullName = `${uuidName}${ext}`;
    const newFilePathWithUUID = join(getBuildScratchDir(), "tmp", "temp_project", uuidFullName);

    renameSync(newFilePath, newFilePathWithUUID);

    newSound.assetId = uuidName;
    newSound.md5ext = uuidFullName;
    newSound.dataFormat = ext.slice(1); // Remove the leading dot

    return newSound;
}

export function createSprite({
    isStage = false,
    name = "default",
    variables = {},
    lists = {}, 
    broadcasts = {}, // TODO: Implement Broadcasts
    blocks = {},
    comments = {}, // TODO: Implement Comments
    currentCostume = 0,
    costumes = [],
    sounds = [], 
    volume = 100,
    visible = true,
    x = 0,
    y = 0,
    size = 100,
    direction = 90,
    draggable = false,
    rotationStyle = "all around",
    layerOrder = 0,
}: Partial<Sprite> = {}) {

    if (costumes.length == 0) {
        if (isStage) {
            costumes.push(createCostume({
                path: join(__dirname, "../../assets", "background.svg")
            }));
        } else {
            costumes.push(createCostume({ 
                path: join(__dirname, "../../assets", "default.svg")
            }));
        }
    }

    if (isStage) name = "Stage";

    return {
        isStage,
        name,
        variables,
        lists,
        broadcasts,
        blocks,
        comments,
        currentCostume,
        costumes,
        sounds,
        volume,
        visible,
        x,
        y,
        size,
        direction,
        draggable,
        rotationStyle,
        layerOrder
    };
}

export function zipFolderToSb3(folderPath: string) {
    const folderName = basename(folderPath);
    const folderDir = dirname(folderPath);
    const outputSb3 = join(folderDir, `${folderName}.sb3`);

    try {
        // Build the archive with adm-zip
        const zip = new AdmZip();
        
        // Recursively add every file under the folder
        function addFolderToZip(folderPath: string, zipPath: string = '') {
            const items = readdirSync(folderPath);
            
            for (const item of items) {
                const itemPath = join(folderPath, item);
                const itemZipPath = zipPath ? join(zipPath, item) : item;
                const stat = statSync(itemPath);
                
                if (stat.isDirectory()) {
                    // Recurse into subdirectories
                    addFolderToZip(itemPath, itemZipPath);
                } else {
                    // Add the file to the archive
                    zip.addLocalFile(itemPath, zipPath);
                }
            }
        }
        
        addFolderToZip(folderPath);
        
        // Write the archive out (saved directly as .sb3)
        zip.writeZip(outputSb3);
        
    } catch (error) {
        throw new Error(`Failed to create SB3 file: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
}

/**
 * Clones a folder from path A to path B synchronously
 * @param source The folder to clone (source path)
 * @param destination The folder where the clone will be placed (destination path)
 */
export function cloneFolderSync(source: string, destination: string): void {
    if (!existsSync(source) || !statSync(source).isDirectory()) {
        throw new Error(`${source} is not a valid directory`);
    }

    if (!existsSync(destination)) {
        mkdirSync(destination, { recursive: true });
    }

    const items = readdirSync(source);

    items.forEach((item) => {
        const sourceItemPath = join(source, item);
        const destItemPath = join(destination, item);

        if (statSync(sourceItemPath).isDirectory()) {
            mkdirSync(destItemPath);
            cloneFolderSync(sourceItemPath, destItemPath); 
        } else {
            copyFileSync(sourceItemPath, destItemPath);
        }
    });
}

/**
 * Recursively deletes all files and subdirectories inside a directory.
 * 
 * @param dirPath The path to the directory to clean.
 */
export function deleteAllContents(dirPath: string): void {
    if (!existsSync(dirPath)) {
        return; // Directory doesn't exist, nothing to delete
    }
    
    const files = readdirSync(dirPath);

    files.forEach((file) => {
        const filePath = join(dirPath, file);

        const stats = statSync(filePath);

        if (stats.isDirectory()) {
            deleteAllContents(filePath);
            rmdirSync(filePath);
        } else if (stats.isFile()) {
            unlinkSync(filePath);
        }
    });
}

export function fillDefaults<T extends Record<string, any>, U extends Record<string, any>>(a: T, b: U): T & U {
    for (const key in b) {
        if (b.hasOwnProperty(key)) {
            if (a[key] == undefined) {
                (a as any)[key] = b[key];
            } else if (typeof a[key] === 'object' && typeof b[key] === 'object' && !Array.isArray(a[key])) {
                fillDefaults(a[key], b[key]);
            }
        }
    }
    return a as T & U;
}

/**
 * Recursively copies all files and directories from pathA to pathB.
 * @param pathA Source directory
 * @param pathB Destination directory
 */
export function copyAllSync(pathA: string, pathB: string) {
    if (!existsSync(pathB)) {
        mkdirSync(pathB, { recursive: true });
    }

    const items = readdirSync(pathA);

    for (const item of items) {
        const srcPath = join(pathA, item);
        const destPath = join(pathB, item);

        const stat = statSync(srcPath);

        if (stat.isDirectory()) {
            copyAllSync(srcPath, destPath);
        } else if (stat.isFile()) {
            copyFileSync(srcPath, destPath);
        }
    }
}
