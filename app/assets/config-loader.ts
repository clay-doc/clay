import type {Configuration} from "~/assets/configuration";
import {load} from "js-yaml";

export function loadFromYamlConfig(yamlString: string): Configuration {
    return load(yamlString) as Configuration;
}