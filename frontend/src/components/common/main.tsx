import CommonButton from "./common-button";
import CommonInput from "./common-input";

export default function CommonMain(){
    return(
        <div className="flex h-screen flex-col gap-4 p-6">

            <span className="text-sm font-semibold text-ink">
                Common Input component
            </span>
            <CommonInput placeholder="Enter text..." type="text" label="Input:" />

            <span className="text-sm font-semibold text-ink">
                Common Button component
            </span>
            <CommonButton label="Button" onClick={() => console.log("Button clicked")} />

        </div>
    )
}
